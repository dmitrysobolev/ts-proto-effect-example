import { Effect, Stream } from "effect"
import * as grpc from "@grpc/grpc-js"
import * as protoLoader from "@grpc/proto-loader"
import path from "path"
import type {
  ServiceError,
  Client,
  ClientReadableStream,
  requestCallback as UnaryCallback
} from "@grpc/grpc-js"
import {
  GetStockPriceRequest,
  GetStockPriceResponse,
  GetMultipleStockPricesRequest,
  GetMultipleStockPricesResponse,
  StreamPriceUpdatesRequest,
  PriceUpdate,
} from "./generated/proto/stock"

// Type for the loaded stock service client
interface StockServiceClient extends Client {
  GetStockPrice: (
    request: GetStockPriceRequest,
    callback: UnaryCallback<GetStockPriceResponse>
  ) => void
  GetMultipleStockPrices: (
    request: GetMultipleStockPricesRequest,
    callback: UnaryCallback<GetMultipleStockPricesResponse>
  ) => void
  StreamPriceUpdates: (
    request: StreamPriceUpdatesRequest
  ) => ClientReadableStream<PriceUpdate>
}

// gRPC client wrapper using Effect
export class StockGrpcClient {
  private client: StockServiceClient

  constructor(address: string = "localhost:50051") {
    // Load proto file
    const PROTO_PATH = path.join(__dirname, '../proto/stock.proto')
    const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true
    })
    
    // Type assertion for the loaded package definition
    interface StockProtoPackage {
      stock: {
        StockService: new (
          address: string,
          credentials: grpc.ChannelCredentials
        ) => StockServiceClient
      }
    }
    
    const stockProto = grpc.loadPackageDefinition(packageDefinition) as unknown as StockProtoPackage
    
    // Create client
    this.client = new stockProto.stock.StockService(
      address,
      grpc.credentials.createInsecure()
    )
  }

  getStockPrice(symbol: string): Effect.Effect<GetStockPriceResponse, Error> {
    return Effect.tryPromise({
      try: () => new Promise<GetStockPriceResponse>((resolve, reject) => {
        this.client.GetStockPrice(
          { symbol },
          (err: ServiceError | null, response?: GetStockPriceResponse) => {
            if (err) {
              reject(new Error(err.message || 'gRPC error'))
            } else if (response) {
              resolve(response)
            } else {
              reject(new Error('No response received'))
            }
          }
        )
      }),
      catch: (error) => error as Error
    })
  }

  getMultipleStockPrices(symbols: string[]): Effect.Effect<GetMultipleStockPricesResponse, Error> {
    return Effect.tryPromise({
      try: () => new Promise<GetMultipleStockPricesResponse>((resolve, reject) => {
        this.client.GetMultipleStockPrices(
          { symbols },
          (err: ServiceError | null, response?: GetMultipleStockPricesResponse) => {
            if (err) {
              reject(new Error(err.message || 'gRPC error'))
            } else if (response) {
              resolve(response)
            } else {
              reject(new Error('No response received'))
            }
          }
        )
      }),
      catch: (error) => error as Error
    })
  }

  streamPriceUpdates(symbols: string[]): Stream.Stream<PriceUpdate, Error> {
    return Stream.async<PriceUpdate, Error>((emit) => {
      const call = this.client.StreamPriceUpdates({ symbols })
      
      call.on('data', (update: PriceUpdate) => {
        emit.single(update)
      })
      
      call.on('error', (err: Error) => {
        emit.fail(err)
      })
      
      call.on('end', () => {
        emit.end()
      })
      
      return Effect.sync(() => {
        call.cancel()
      })
    })
  }

  close(): Effect.Effect<void, never> {
    return Effect.sync(() => {
      grpc.closeClient(this.client)
    })
  }
}
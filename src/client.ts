import { Effect, Stream } from "effect"
import { createChannel, createClient } from "nice-grpc"
import type { Channel } from "nice-grpc"
import {
  GetStockPriceResponse,
  GetMultipleStockPricesResponse,
  PriceUpdate,
  StockServiceClient,
  StockServiceDefinition,
} from "./generated/proto/stock"

// gRPC client wrapper using Effect
export class StockGrpcClient {
  private readonly channel: Channel
  private readonly client: StockServiceClient

  constructor(address: string = "localhost:50051") {
    this.channel = createChannel(address)
    this.client = createClient(StockServiceDefinition, this.channel)
  }

  getStockPrice(symbol: string): Effect.Effect<GetStockPriceResponse, Error> {
    return Effect.tryPromise({
      try: () => this.client.getStockPrice({ symbol }),
      catch: (error) => new Error(error instanceof Error ? error.message : String(error))
    })
  }

  getMultipleStockPrices(symbols: string[]): Effect.Effect<GetMultipleStockPricesResponse, Error> {
    return Effect.tryPromise({
      try: () => this.client.getMultipleStockPrices({ symbols }),
      catch: (error) => new Error(error instanceof Error ? error.message : String(error))
    })
  }

  streamPriceUpdates(symbols: string[]): Stream.Stream<PriceUpdate, Error> {
    return Stream.fromAsyncIterable(
      this.client.streamPriceUpdates({ symbols }),
      (error) => new Error(error instanceof Error ? error.message : String(error))
    )
  }

  close(): Effect.Effect<void, never> {
    return Effect.sync(() => {
      this.channel.close()
    })
  }
}
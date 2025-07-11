import * as grpc from "@grpc/grpc-js"
import * as protoLoader from "@grpc/proto-loader"
import path from "path"
import type {
  handleUnaryCall,
  handleServerStreamingCall,
  sendUnaryData,
  ServerUnaryCall,
  ServerWritableStream,
  ServiceError,
  UntypedServiceImplementation
} from "@grpc/grpc-js"
import type {
  GetStockPriceRequest,
  GetStockPriceResponse,
  GetMultipleStockPricesRequest,
  GetMultipleStockPricesResponse,
  StreamPriceUpdatesRequest,
  PriceUpdate
} from "./generated/proto/stock"

// Mock stock data
const mockStocks = new Map([
  ["AAPL", { name: "Apple Inc.", basePrice: 180.0 }],
  ["GOOGL", { name: "Alphabet Inc.", basePrice: 140.0 }],
  ["MSFT", { name: "Microsoft Corp.", basePrice: 380.0 }],
  ["AMZN", { name: "Amazon.com Inc.", basePrice: 170.0 }],
  ["TSLA", { name: "Tesla Inc.", basePrice: 250.0 }],
])

// Generate random price fluctuation
const generatePrice = (basePrice: number) => {
  const variation = (Math.random() - 0.5) * 0.1 // ±5% variation
  return basePrice * (1 + variation)
}

// Generate random change percentage
const generateChange = () => (Math.random() - 0.5) * 10 // ±5% change

// gRPC service implementation
const stockService: UntypedServiceImplementation = {
  GetStockPrice: ((call: ServerUnaryCall<GetStockPriceRequest, GetStockPriceResponse>, callback: sendUnaryData<GetStockPriceResponse>) => {
    const { symbol } = call.request
    const stock = mockStocks.get(symbol)
    
    if (!stock) {
      const error: Partial<ServiceError> = {
        code: grpc.status.NOT_FOUND,
        message: `Stock symbol ${symbol} not found`,
        name: 'NotFound',
        details: ''
      }
      callback(error as ServiceError)
      return
    }

    const price = generatePrice(stock.basePrice)
    const change = generateChange()
    
    callback(null, {
      symbol: symbol,
      price: Math.round(price * 100) / 100,
      currency: "USD",
      timestamp: Date.now(),
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(change * 10) / 10,
    })
  }) as handleUnaryCall<GetStockPriceRequest, GetStockPriceResponse>,

  GetMultipleStockPrices: ((call: ServerUnaryCall<GetMultipleStockPricesRequest, GetMultipleStockPricesResponse>, callback: sendUnaryData<GetMultipleStockPricesResponse>) => {
    const { symbols } = call.request
    const prices = symbols.map((symbol) => {
      const stock = mockStocks.get(symbol)
      
      if (!stock) {
        return {
          symbol,
          price: 0,
          currency: "USD",
          timestamp: Date.now(),
          change: 0,
          changePercent: 0,
        }
      }

      const price = generatePrice(stock.basePrice)
      const change = generateChange()
      
      return {
        symbol,
        price: Math.round(price * 100) / 100,
        currency: "USD",
        timestamp: Date.now(),
        change: Math.round(change * 100) / 100,
        changePercent: Math.round(change * 10) / 10,
      }
    })
    
    callback(null, { prices })
  }) as handleUnaryCall<GetMultipleStockPricesRequest, GetMultipleStockPricesResponse>,

  StreamPriceUpdates: ((call: ServerWritableStream<StreamPriceUpdatesRequest, PriceUpdate>) => {
    const { symbols } = call.request
    
    const interval = setInterval(() => {
      const symbol = symbols[Math.floor(Math.random() * symbols.length)]
      const stock = symbol ? mockStocks.get(symbol) : undefined
      
      if (!stock || !symbol) {
        return
      }
      
      const price = generatePrice(stock.basePrice)
      const volume = Math.floor(Math.random() * 1000000)
      
      call.write({
        symbol,
        price: Math.round(price * 100) / 100,
        timestamp: Date.now(),
        volume,
      })
    }, 1000)
    
    call.on('cancelled', () => {
      clearInterval(interval)
    })
    
    call.on('error', () => {
      clearInterval(interval)
    })
  }) as handleServerStreamingCall<StreamPriceUpdatesRequest, PriceUpdate>
}

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
    StockService: {
      service: grpc.ServiceDefinition
    }
  }
}

const stockProto = grpc.loadPackageDefinition(packageDefinition) as unknown as StockProtoPackage

// Create server
const server = new grpc.Server()

// Add service
server.addService(stockProto.stock.StockService.service, stockService)

// Start server
const port = 50051
server.bindAsync(
  `0.0.0.0:${port}`,
  grpc.ServerCredentials.createInsecure(),
  (err, port) => {
    if (err) {
      console.error('Failed to start server:', err)
      return
    }
    
    console.log(`gRPC Stock Price Server listening on port ${port}`)
    console.log("Using real protobuf binary serialization")
    console.log("Service: StockService")
    console.log("Methods:")
    console.log("  - GetStockPrice (unary)")
    console.log("  - GetMultipleStockPrices (unary)")
    console.log("  - StreamPriceUpdates (server streaming)")
  }
)
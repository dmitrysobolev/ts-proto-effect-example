import { createServer } from "nice-grpc"
import {
  StockServiceDefinition,
  StockServiceImplementation,
  GetStockPriceRequest,
  GetStockPriceResponse,
  GetMultipleStockPricesRequest,
  GetMultipleStockPricesResponse,
  StreamPriceUpdatesRequest,
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
const stockServiceImpl: StockServiceImplementation = {
  async getStockPrice(request: GetStockPriceRequest): Promise<GetStockPriceResponse> {
    const { symbol } = request
    const stock = mockStocks.get(symbol)
    
    if (!stock) {
      throw new Error(`Stock symbol ${symbol} not found`)
    }

    const price = generatePrice(stock.basePrice)
    const change = generateChange()
    
    return {
      symbol: symbol,
      price: Math.round(price * 100) / 100,
      currency: "USD",
      timestamp: Date.now(),
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(change * 10) / 10,
    }
  },

  async getMultipleStockPrices(request: GetMultipleStockPricesRequest): Promise<GetMultipleStockPricesResponse> {
    const { symbols } = request
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
    
    return { prices }
  },

  async *streamPriceUpdates(request: StreamPriceUpdatesRequest) {
    const { symbols } = request
    
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      const symbol = symbols[Math.floor(Math.random() * symbols.length)]
      const stock = symbol ? mockStocks.get(symbol) : undefined
      
      if (!stock || !symbol) {
        continue
      }
      
      const price = generatePrice(stock.basePrice)
      const volume = Math.floor(Math.random() * 1000000)
      
      yield {
        symbol,
        price: Math.round(price * 100) / 100,
        timestamp: Date.now(),
        volume,
      }
    }
  }
}

// Create and start server
async function startServer() {
  const server = createServer()
  
  server.add(StockServiceDefinition, stockServiceImpl)
  
  const port = 50051
  await server.listen(`0.0.0.0:${port}`)
  
  console.log(`gRPC Stock Price Server listening on port ${port}`)
  console.log("Using real protobuf binary serialization")
  console.log("Service: StockService")
  console.log("Methods:")
  console.log("  - GetStockPrice (unary)")
  console.log("  - GetMultipleStockPrices (unary)")
  console.log("  - StreamPriceUpdates (server streaming)")
}

startServer().catch(console.error)
import { createServer } from "nice-grpc"
import { Effect, pipe, Runtime, Console, Layer, Data } from "effect"
import {
  StockServiceDefinition,
  StockServiceImplementation,
  GetStockPriceRequest,
  GetStockPriceResponse,
  GetMultipleStockPricesRequest,
  GetMultipleStockPricesResponse,
  StreamPriceUpdatesRequest,
} from "./generated/proto/stock"

// Error types
class StockNotFoundError extends Data.TaggedError("StockNotFoundError")<{
  readonly symbol: string
}> {}

class InvalidRequestError extends Data.TaggedError("InvalidRequestError")<{
  readonly message: string
}> {}

type ServiceError = StockNotFoundError | InvalidRequestError

// Mock stock data
const mockStocks = new Map([
  ["AAPL", { name: "Apple Inc.", basePrice: 180.0 }],
  ["GOOGL", { name: "Alphabet Inc.", basePrice: 140.0 }],
  ["MSFT", { name: "Microsoft Corp.", basePrice: 380.0 }],
  ["AMZN", { name: "Amazon.com Inc.", basePrice: 170.0 }],
  ["TSLA", { name: "Tesla Inc.", basePrice: 250.0 }],
])

// Generate random price fluctuation
const generatePrice = (basePrice: number): Effect.Effect<number> =>
  Effect.sync(() => {
    const variation = (Math.random() - 0.5) * 0.1 // ±5% variation
    return basePrice * (1 + variation)
  })

// Generate random change percentage
const generateChange = (): Effect.Effect<number> =>
  Effect.sync(() => (Math.random() - 0.5) * 10) // ±5% change

// Get stock data
const getStock = (symbol: string): Effect.Effect<{ name: string; basePrice: number }, StockNotFoundError> =>
  Effect.suspend(() => {
    const stock = mockStocks.get(symbol)
    return stock
      ? Effect.succeed(stock)
      : Effect.fail(new StockNotFoundError({ symbol }))
  })

// Effect-based service implementations
const getStockPriceEffect = (request: GetStockPriceRequest): Effect.Effect<GetStockPriceResponse, ServiceError> =>
  pipe(
    Effect.all({
      stock: getStock(request.symbol),
      price: Effect.suspend(() => getStock(request.symbol)).pipe(
        Effect.flatMap((stock) => generatePrice(stock.basePrice))
      ),
      change: generateChange(),
    }),
    Effect.map(({ price, change }) => ({
      symbol: request.symbol,
      price: Math.round(price * 100) / 100,
      currency: "USD",
      timestamp: Date.now(),
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(change * 10) / 10,
    }))
  )

// Adapter to convert Effect to Promise for nice-grpc
const runEffect = <A, E>(effect: Effect.Effect<A, E>): Promise<A> =>
  Runtime.runPromise(Runtime.defaultRuntime)(
    pipe(
      effect,
      Effect.catchAll((error) => {
        if (error instanceof StockNotFoundError) {
          return Effect.fail(new Error(`Stock symbol ${error.symbol} not found`))
        }
        if (error instanceof InvalidRequestError) {
          return Effect.fail(new Error(error.message))
        }
        return Effect.fail(new Error("Unknown error"))
      })
    )
  )

// gRPC service implementation
const stockServiceImpl: StockServiceImplementation = {
  async getStockPrice(request: GetStockPriceRequest): Promise<GetStockPriceResponse> {
    return runEffect(getStockPriceEffect(request))
  },

  async getMultipleStockPrices(request: GetMultipleStockPricesRequest): Promise<GetMultipleStockPricesResponse> {
    const getMultiplePricesEffect = pipe(
      Effect.all(
        request.symbols.map((symbol) =>
          pipe(
            getStock(symbol),
            Effect.flatMap((stock) =>
              Effect.all({
                price: generatePrice(stock.basePrice),
                change: generateChange(),
              })
            ),
            Effect.map(({ price, change }) => ({
              symbol,
              price: Math.round(price * 100) / 100,
              currency: "USD",
              timestamp: Date.now(),
              change: Math.round(change * 100) / 100,
              changePercent: Math.round(change * 10) / 10,
            })),
            Effect.catchAll(() =>
              Effect.succeed({
                symbol,
                price: 0,
                currency: "USD",
                timestamp: Date.now(),
                change: 0,
                changePercent: 0,
              })
            )
          )
        )
      ),
      Effect.map((prices) => ({ prices }))
    )
    
    return runEffect(getMultiplePricesEffect)
  },

  async *streamPriceUpdates(request: StreamPriceUpdatesRequest) {
    const { symbols } = request
    
    // Simple streaming implementation using Effect
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      const updateEffect = pipe(
        Effect.sync(() => symbols[Math.floor(Math.random() * symbols.length)]),
        Effect.filterOrFail(
          (symbol): symbol is string => symbol !== undefined,
          () => new InvalidRequestError({ message: "No symbol selected" })
        ),
        Effect.flatMap((symbol) =>
          pipe(
            getStock(symbol),
            Effect.flatMap((stock) =>
              Effect.all({
                symbol: Effect.succeed(symbol),
                price: generatePrice(stock.basePrice),
                volume: Effect.sync(() => Math.floor(Math.random() * 1000000)),
              })
            ),
            Effect.map(({ symbol, price, volume }) => ({
              symbol,
              price: Math.round(price * 100) / 100,
              timestamp: Date.now(),
              volume,
            }))
          )
        ),
        Effect.catchAll(() => Effect.succeed(null))
      )
      
      const result = await Runtime.runPromise(Runtime.defaultRuntime)(updateEffect)
      
      if (result) {
        yield result
      }
    }
  }
}

// Server configuration
interface ServerConfig {
  readonly port: number
}

class ServerConfigService extends Effect.Tag("ServerConfig")<ServerConfigService, ServerConfig>() {}

// Create and start server using Effect
const startServerEffect = Effect.gen(function* () {
  const config = yield* ServerConfigService
  const server = createServer()
  
  server.add(StockServiceDefinition, stockServiceImpl)
  
  yield* Effect.tryPromise({
    try: () => server.listen(`0.0.0.0:${config.port}`),
    catch: (error) => new Error(`Failed to start server: ${error}`),
  })
  
  yield* Console.log(`gRPC Stock Price Server listening on port ${config.port}`)
  yield* Console.log("Using real protobuf binary serialization")
  yield* Console.log("Service: StockService")
  yield* Console.log("Methods:")
  yield* Console.log("  - GetStockPrice (unary)")
  yield* Console.log("  - GetMultipleStockPrices (unary)")
  yield* Console.log("  - StreamPriceUpdates (server streaming)")
  
  // Keep server running
  yield* Effect.never
})

// Server configuration layer
const ServerConfigLive = Layer.succeed(
  ServerConfigService,
  { port: 50051 }
)

// Main program
const program = startServerEffect.pipe(
  Effect.provide(ServerConfigLive),
  Effect.scoped
)

// Run the server
Effect.runPromise(program).catch(console.error)
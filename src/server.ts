import { Effect, Layer, Stream, Random, Schedule, pipe, Array as EffectArray } from "effect"
import * as Http from "@effect/platform/HttpServer"
import * as NodeHttp from "@effect/platform-node/NodeHttpServer"
import { NodeRuntime } from "@effect/platform-node"
import * as Schema from "@effect/schema/Schema"
import {
  StockServiceServiceImpl,
  GetStockPriceRequest,
  GetStockPriceResponse,
  GetMultipleStockPricesRequest,
  GetMultipleStockPricesResponse,
  StreamPriceUpdatesRequest,
  PriceUpdate,
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
const generatePrice = (basePrice: number) =>
  Random.next.pipe(
    Effect.map((random) => {
      const variation = (random - 0.5) * 0.1 // ±5% variation
      return basePrice * (1 + variation)
    })
  )

// Generate random change percentage
const generateChange = () =>
  Random.next.pipe(
    Effect.map((random) => (random - 0.5) * 10) // ±5% change
  )

// StockService implementation using Effect
class StockServiceImpl implements StockServiceServiceImpl {
  GetStockPrice(request: GetStockPriceRequest) {
    return Effect.gen(function* () {
      const stock = mockStocks.get(request.symbol)
      
      if (!stock) {
        return yield* Effect.fail(new Error(`Stock symbol ${request.symbol} not found`))
      }

      const price = yield* generatePrice(stock.basePrice)
      const change = yield* generateChange()
      
      return {
        symbol: request.symbol,
        price: Math.round(price * 100) / 100,
        currency: "USD",
        timestamp: Date.now(),
        change: Math.round(change * 100) / 100,
        changePercent: Math.round(change * 10) / 10,
      } satisfies GetStockPriceResponse
    })
  }

  GetMultipleStockPrices(request: GetMultipleStockPricesRequest) {
    return Effect.gen(function* () {
      const prices = yield* Effect.all(
        request.symbols.map((symbol) =>
          this.GetStockPrice({ symbol }).pipe(
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
      )
      
      return { prices } satisfies GetMultipleStockPricesResponse
    })
  }

  StreamPriceUpdates(request: StreamPriceUpdatesRequest) {
    return Stream.gen(function* () {
      while (true) {
        yield* Effect.sleep("1 second")
        
        const symbol = request.symbols[Math.floor(Math.random() * request.symbols.length)]
        const stock = mockStocks.get(symbol)
        
        if (stock) {
          const price = yield* generatePrice(stock.basePrice)
          const volume = yield* Random.next.pipe(Effect.map((r) => Math.floor(r * 1000000)))
          
          yield {
            symbol,
            price: Math.round(price * 100) / 100,
            timestamp: Date.now(),
            volume,
          } satisfies PriceUpdate
        }
      }
    }).pipe(Stream.forever)
  }
}

// Create HTTP server with the stock service
const StockHttpService = Http.router.empty.pipe(
  Http.router.post(
    "/api/stock/price",
    Effect.gen(function* () {
      const body = yield* Http.request.ServerRequest
      const request = yield* Http.request.schemaBodyJson(Schema.Struct({
        symbol: Schema.String,
      }))(body)
      
      const service = new StockServiceImpl()
      const response = yield* service.GetStockPrice(request)
      
      return yield* Http.response.json(response)
    })
  ),
  Http.router.post(
    "/api/stock/prices",
    Effect.gen(function* () {
      const body = yield* Http.request.ServerRequest
      const request = yield* Http.request.schemaBodyJson(Schema.Struct({
        symbols: Schema.Array(Schema.String),
      }))(body)
      
      const service = new StockServiceImpl()
      const response = yield* service.GetMultipleStockPrices(request)
      
      return yield* Http.response.json(response)
    })
  ),
  Http.router.get(
    "/api/stock/stream",
    Effect.gen(function* () {
      const url = yield* Http.request.ServerRequest.pipe(Effect.map(_ => _.url))
      const params = new URLSearchParams(url.split("?")[1] || "")
      const symbols = params.get("symbols")?.split(",") || []
      
      if (symbols.length === 0) {
        return yield* Http.response.json({ error: "No symbols provided" }, { status: 400 })
      }
      
      const service = new StockServiceImpl()
      const stream = service.StreamPriceUpdates({ symbols })
      
      return yield* Http.response.stream(
        stream.pipe(
          Stream.map((update) => `data: ${JSON.stringify(update)}\n\n`),
          Stream.encodeText
        ),
        {
          headers: Http.headers.fromInput({
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
          }),
        }
      )
    })
  )
)

// Server configuration
const ServerLive = NodeHttp.server.layer(() => StockHttpService, {
  port: 3000,
})

// Main program
const program = Effect.gen(function* () {
  yield* Effect.log("Stock Price API Server starting on port 3000")
  yield* Effect.log("Available endpoints:")
  yield* Effect.log("  POST /api/stock/price - Get single stock price")
  yield* Effect.log("  POST /api/stock/prices - Get multiple stock prices")
  yield* Effect.log("  GET /api/stock/stream?symbols=AAPL,GOOGL - Stream price updates")
  yield* Effect.never
})

// Run the server
program.pipe(
  Effect.provide(ServerLive),
  NodeRuntime.runMain
)
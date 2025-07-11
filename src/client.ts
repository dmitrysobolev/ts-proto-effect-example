import { Effect, Stream, Console, pipe } from "effect"
import * as Http from "@effect/platform/HttpClient"
import * as NodeHttp from "@effect/platform-node/NodeHttpClient"
import * as Schema from "@effect/schema/Schema"
import {
  GetStockPriceRequest,
  GetStockPriceResponse,
  GetMultipleStockPricesRequest,
  GetMultipleStockPricesResponse,
  PriceUpdate,
} from "./generated/proto/stock"

// Schema definitions for response validation
const StockPriceSchema = Schema.Struct({
  symbol: Schema.String,
  price: Schema.Number,
  currency: Schema.String,
  timestamp: Schema.Number,
  change: Schema.Number,
  changePercent: Schema.Number,
})

const MultiplePricesSchema = Schema.Struct({
  prices: Schema.Array(StockPriceSchema),
})

// Stock client implementation using Effect
export class StockClient {
  constructor(private readonly baseUrl: string = "http://localhost:3000") {}

  getStockPrice(symbol: string) {
    return Effect.gen(function* () {
      const client = yield* Http.client.Client
      
      const response = yield* client(
        Http.request.post(`${this.baseUrl}/api/stock/price`).pipe(
          Http.request.jsonBody({ symbol } satisfies GetStockPriceRequest)
        )
      ).pipe(
        Effect.flatMap(Http.response.schemaBodyJson(StockPriceSchema)),
        Effect.scoped
      )
      
      return response as GetStockPriceResponse
    }.bind(this))
  }

  getMultipleStockPrices(symbols: string[]) {
    return Effect.gen(function* () {
      const client = yield* Http.client.Client
      
      const response = yield* client(
        Http.request.post(`${this.baseUrl}/api/stock/prices`).pipe(
          Http.request.jsonBody({ symbols } satisfies GetMultipleStockPricesRequest)
        )
      ).pipe(
        Effect.flatMap(Http.response.schemaBodyJson(MultiplePricesSchema)),
        Effect.scoped
      )
      
      return response as GetMultipleStockPricesResponse
    }.bind(this))
  }

  streamPriceUpdates(symbols: string[]) {
    return Stream.gen(function* () {
      const client = yield* Http.client.Client
      const symbolsParam = symbols.join(",")
      
      const response = yield* client(
        Http.request.get(`${this.baseUrl}/api/stock/stream?symbols=${symbolsParam}`)
      ).pipe(Effect.scoped)
      
      const stream = response.stream.pipe(
        Stream.decodeText(),
        Stream.splitLines,
        Stream.filter((line) => line.startsWith("data: ")),
        Stream.map((line) => line.substring(6)),
        Stream.filter((data) => data.length > 0),
        Stream.mapEffect((data) =>
          Effect.try({
            try: () => JSON.parse(data) as PriceUpdate,
            catch: (error) => new Error(`Failed to parse price update: ${error}`),
          })
        )
      )
      
      yield* Stream.fromEffect(Effect.log(`Starting price stream for symbols: ${symbols.join(", ")}`))
      
      while (true) {
        const update = yield* Stream.take(stream, 1).pipe(Stream.runCollect)
        if (update.length > 0) {
          yield update[0]!
        }
      }
    }.bind(this))
  }
}

// Helper functions for pretty printing
const formatPrice = (price: number) => `$${price.toFixed(2)}`
const formatChange = (change: number, changePercent: number) => {
  const sign = change >= 0 ? "+" : ""
  return `${sign}${change.toFixed(2)} (${sign}${changePercent.toFixed(1)}%)`
}

// Example client usage functions
export const exampleGetSinglePrice = (symbol: string) =>
  Effect.gen(function* () {
    const client = new StockClient()
    
    yield* Console.log(`Fetching price for ${symbol}...`)
    
    const price = yield* client.getStockPrice(symbol).pipe(
      Effect.catchAll((error) =>
        Effect.fail(`Failed to fetch price: ${error.message}`)
      )
    )
    
    yield* Console.log(`
${price.symbol}: ${formatPrice(price.price)} ${price.currency}
Change: ${formatChange(price.change, price.changePercent)}
Time: ${new Date(price.timestamp).toLocaleString()}
`)
    
    return price
  })

export const exampleGetMultiplePrices = (symbols: string[]) =>
  Effect.gen(function* () {
    const client = new StockClient()
    
    yield* Console.log(`Fetching prices for: ${symbols.join(", ")}...`)
    
    const response = yield* client.getMultipleStockPrices(symbols).pipe(
      Effect.catchAll((error) =>
        Effect.fail(`Failed to fetch prices: ${error.message}`)
      )
    )
    
    yield* Console.log("\nStock Prices:")
    yield* Console.log("=" .repeat(50))
    
    for (const price of response.prices) {
      yield* Console.log(
        `${price.symbol.padEnd(6)} | ${formatPrice(price.price).padEnd(10)} | ${formatChange(
          price.change,
          price.changePercent
        )}`
      )
    }
    
    return response
  })

export const exampleStreamPrices = (symbols: string[], duration: number = 10000) =>
  Effect.gen(function* () {
    const client = new StockClient()
    
    yield* Console.log(`Streaming prices for: ${symbols.join(", ")}`)
    yield* Console.log(`Duration: ${duration / 1000} seconds`)
    yield* Console.log("=" .repeat(50))
    
    const stream = client.streamPriceUpdates(symbols).pipe(
      Stream.tap((update) =>
        Console.log(
          `[${new Date(update.timestamp).toLocaleTimeString()}] ${
            update.symbol
          }: ${formatPrice(update.price)} | Volume: ${update.volume.toLocaleString()}`
        )
      ),
      Stream.interruptAfter(`${duration} millis`)
    )
    
    yield* Stream.runDrain(stream)
    yield* Console.log("\nStream ended")
  })

// Layer for HTTP client
export const HttpClientLive = NodeHttp.client.layer
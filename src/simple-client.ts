import { Effect, Stream, Console, Schema } from "effect"
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

// Simple HTTP client using fetch
export class StockClient {
  constructor(private readonly baseUrl: string = "http://localhost:3000") {}

  getStockPrice(symbol: string): Effect.Effect<GetStockPriceResponse, Error> {
    return Effect.tryPromise({
      try: async () => {
        const response = await fetch(`${this.baseUrl}/api/stock/price`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol } satisfies GetStockPriceRequest)
        })
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        
        const data = await response.json()
        return data as GetStockPriceResponse
      },
      catch: (error) => new Error(String(error))
    }).pipe(
      Effect.flatMap((data) => Schema.decodeUnknown(StockPriceSchema)(data))
    )
  }

  getMultipleStockPrices(symbols: string[]): Effect.Effect<GetMultipleStockPricesResponse, Error> {
    return Effect.tryPromise({
      try: async () => {
        const response = await fetch(`${this.baseUrl}/api/stock/prices`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbols } satisfies GetMultipleStockPricesRequest)
        })
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        
        const data = await response.json()
        return data as GetMultipleStockPricesResponse
      },
      catch: (error) => new Error(String(error))
    }).pipe(
      Effect.flatMap((data) => Schema.decodeUnknown(MultiplePricesSchema)(data)),
      Effect.map((validated) => ({ prices: validated.prices as GetStockPriceResponse[] }))
    )
  }

  streamPriceUpdates(symbols: string[]): Stream.Stream<PriceUpdate, Error> {
    return Stream.async<PriceUpdate, Error>((emit) => {
      const abortController = new AbortController()
      const symbolsParam = symbols.join(",")
      
      const startStream = async () => {
        try {
          const response = await fetch(
            `${this.baseUrl}/api/stock/stream?symbols=${symbolsParam}`,
            { signal: abortController.signal }
          )
          
          if (!response.ok || !response.body) {
            throw new Error(`HTTP error! status: ${response.status}`)
          }
          
          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ""
          
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ""
            
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.substring(6))
                  emit.single(data as PriceUpdate)
                } catch (e) {
                  // Skip malformed data
                }
              }
            }
          }
        } catch (error) {
          if (!abortController.signal.aborted) {
            emit.fail(new Error(String(error)))
          }
        }
        emit.end()
      }
      
      startStream()
      
      return Effect.sync(() => {
        abortController.abort()
      })
    })
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
      Effect.catchAll((error) => Effect.die(`Failed to fetch price: ${error}`))
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
      Effect.catchAll((error) => Effect.die(`Failed to fetch prices: ${error}`))
    )
    
    yield* Console.log("\nStock Prices:")
    yield* Console.log("=".repeat(50))
    
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
    yield* Console.log("=".repeat(50))
    
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
import { Effect, Stream, Schema } from "effect"
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
  constructor(private readonly baseUrl: string = "http://localhost:3001") {}

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


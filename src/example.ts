import { Effect, Stream, Console } from "effect"
import { NodeRuntime } from "@effect/platform-node"
import { StockGrpcClient } from "./client"

// Helper functions for pretty printing
const formatPrice = (price: number) => `$${price.toFixed(2)}`
const formatChange = (change: number, changePercent: number) => {
  const sign = change >= 0 ? "+" : ""
  return `${sign}${change.toFixed(2)} (${sign}${changePercent.toFixed(1)}%)`
}

// Example: Get single stock price via gRPC
const exampleGetSinglePrice = (symbol: string) =>
  Effect.gen(function* () {
    const client = new StockGrpcClient()
    
    yield* Console.log(`[gRPC] Fetching price for ${symbol}...`)
    
    const price = yield* client.getStockPrice(symbol).pipe(
      Effect.catchAll((error) => Effect.die(`Failed to fetch price: ${error}`))
    )
    
    yield* Console.log("Response:", JSON.stringify(price, null, 2))
    
    yield* Console.log(`
${price.symbol}: ${formatPrice(price.price)} ${price.currency}
Change: ${formatChange(price.change || 0, price.changePercent || 0)}
Time: ${new Date(Number(price.timestamp)).toLocaleString()}
`)
    
    yield* client.close()
    return price
  })

// Example: Get multiple stock prices via gRPC
const exampleGetMultiplePrices = (symbols: string[]) =>
  Effect.gen(function* () {
    const client = new StockGrpcClient()
    
    yield* Console.log(`[gRPC] Fetching prices for: ${symbols.join(", ")}...`)
    
    const response = yield* client.getMultipleStockPrices(symbols).pipe(
      Effect.catchAll((error) => Effect.die(`Failed to fetch prices: ${error}`))
    )
    
    yield* Console.log("\nStock Prices:")
    yield* Console.log("=".repeat(50))
    
    for (const price of response.prices) {
      yield* Console.log(
        `${price.symbol.padEnd(6)} | ${formatPrice(price.price).padEnd(10)} | ${formatChange(
          price.change || 0,
          price.changePercent || 0
        )}`
      )
    }
    
    yield* client.close()
    return response
  })

// Example: Stream price updates via gRPC
const exampleStreamPrices = (symbols: string[], duration: number = 10000) =>
  Effect.gen(function* () {
    const client = new StockGrpcClient()
    
    yield* Console.log(`[gRPC] Streaming prices for: ${symbols.join(", ")}`)
    yield* Console.log(`Duration: ${duration / 1000} seconds`)
    yield* Console.log("=".repeat(50))
    
    const stream = client.streamPriceUpdates(symbols).pipe(
      Stream.tap((update) =>
        Console.log(
          `[${new Date(Number(update.timestamp)).toLocaleTimeString()}] ${
            update.symbol
          }: ${formatPrice(update.price)} | Volume: ${update.volume.toLocaleString()}`
        )
      ),
      Stream.interruptAfter(`${duration} millis`)
    )
    
    yield* Stream.runDrain(stream)
    yield* Console.log("\nStream ended")
    yield* client.close()
  })

// Main example program
const program = Effect.gen(function* () {
  yield* Console.log("=== gRPC Stock Price API Example ===\n")
  yield* Console.log("Using real protobuf binary serialization over gRPC\n")
  
  // Example 1: Get single stock price
  yield* Console.log("1. Getting single stock price:")
  yield* exampleGetSinglePrice("AAPL")
  
  // Example 2: Get multiple stock prices
  yield* Console.log("\n2. Getting multiple stock prices:")
  yield* exampleGetMultiplePrices(["AAPL", "GOOGL", "MSFT", "AMZN", "TSLA"])
  
  // Example 3: Stream price updates
  yield* Console.log("\n3. Streaming price updates (5 seconds):")
  yield* exampleStreamPrices(["AAPL", "GOOGL", "MSFT"], 5000)
  
  yield* Console.log("\n=== Example completed ===")
})

// Run the example
// Make sure the gRPC server is running first: npm run grpc-server
NodeRuntime.runMain(program)
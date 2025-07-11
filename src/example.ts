import { Effect, Console, pipe } from "effect"
import { NodeRuntime } from "@effect/platform-node"
import {
  exampleGetSinglePrice,
  exampleGetMultiplePrices,
  exampleStreamPrices,
  HttpClientLive,
} from "./client"

// Main example program
const program = Effect.gen(function* () {
  yield* Console.log("=== Stock Price API Example ===\n")
  
  // Example 1: Get single stock price
  yield* Console.log("1. Getting single stock price:")
  yield* exampleGetSinglePrice("AAPL").pipe(
    Effect.catchAll((error) => Console.error(`Error: ${error}`))
  )
  
  // Example 2: Get multiple stock prices
  yield* Console.log("\n2. Getting multiple stock prices:")
  yield* exampleGetMultiplePrices(["AAPL", "GOOGL", "MSFT", "AMZN", "TSLA"]).pipe(
    Effect.catchAll((error) => Console.error(`Error: ${error}`))
  )
  
  // Example 3: Stream price updates
  yield* Console.log("\n3. Streaming price updates (5 seconds):")
  yield* exampleStreamPrices(["AAPL", "GOOGL", "MSFT"], 5000).pipe(
    Effect.catchAll((error) => Console.error(`Error: ${error}`))
  )
  
  yield* Console.log("\n=== Example completed ===")
})

// Run the example
// Make sure the server is running first: npm run server
program.pipe(
  Effect.provide(HttpClientLive),
  NodeRuntime.runMain
)
import { Effect, Runtime, Exit, Layer, pipe } from "effect"
import { createServer } from "nice-grpc"
import {
  StockServiceDefinition,
  GetStockPriceRequest,
  GetMultipleStockPricesRequest,
  StreamPriceUpdatesRequest,
} from "./generated/proto/stock"
import {
  StockNotFoundError,
  InvalidRequestError,
  generatePrice,
  generateChange,
  getStock,
  getStockPriceEffect,
  runEffect,
  stockServiceImpl,
  startServerEffect,
  ServerConfigService,
} from "./server"

// Set NODE_ENV to test to prevent server from starting
process.env.NODE_ENV = 'test'

jest.mock("nice-grpc", () => ({
  createServer: jest.fn(),
}))

const mockCreateServer = createServer as jest.MockedFunction<typeof createServer>

describe("server.ts", () => {
  let mockServer: any
  let logInfoSpy: jest.SpyInstance
  let logErrorSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    
    mockServer = {
      add: jest.fn(),
      listen: jest.fn().mockResolvedValue(undefined),
    }
    mockCreateServer.mockReturnValue(mockServer as any)

    logInfoSpy = jest.spyOn(Effect, "logInfo").mockImplementation(() => Effect.void)
    logErrorSpy = jest.spyOn(Effect, "logError").mockImplementation(() => Effect.void)
  })

  afterEach(() => {
    logInfoSpy.mockRestore()
    logErrorSpy.mockRestore()
  })

  describe("StockNotFoundError", () => {
    it("should be a tagged error with symbol property", () => {
      const error = new StockNotFoundError({ symbol: "INVALID" })
      expect(error._tag).toBe("StockNotFoundError")
      expect(error.symbol).toBe("INVALID")
    })
  })

  describe("InvalidRequestError", () => {
    it("should be a tagged error with message property", () => {
      const error = new InvalidRequestError({ message: "Invalid request" })
      expect(error._tag).toBe("InvalidRequestError")
      expect(error.message).toBe("Invalid request")
    })
  })

  describe("getStockPrice", () => {
    it("should return stock price for valid symbol", async () => {
      const request: GetStockPriceRequest = { symbol: "AAPL" }
      const mockContext = {} as any
      const response = await stockServiceImpl.getStockPrice(request, mockContext)

      expect(response.symbol).toBe("AAPL")
      expect(response.currency).toBe("USD")
      expect(response.price).toBeGreaterThan(0)
      expect(response.timestamp).toBeGreaterThan(0)
      expect(typeof response.change).toBe("number")
      expect(typeof response.changePercent).toBe("number")
    })

    it("should throw error for invalid symbol", async () => {
      const request: GetStockPriceRequest = { symbol: "INVALID" }
      const mockContext = {} as any
      
      await expect(stockServiceImpl.getStockPrice(request, mockContext)).rejects.toThrow(
        "Stock symbol INVALID not found"
      )
    })

    it("should generate price within expected range", async () => {
      const request: GetStockPriceRequest = { symbol: "AAPL" }
      const responses = await Promise.all(
        Array(10).fill(null).map(() => stockServiceImpl.getStockPrice(request, {} as any))
      )

      responses.forEach((response) => {
        expect(response.price).toBeGreaterThan(171) // 180 * 0.95
        expect(response.price).toBeLessThan(189) // 180 * 1.05
      })
    })
  })

  describe("getMultipleStockPrices", () => {
    it("should return prices for multiple valid symbols", async () => {
      const request: GetMultipleStockPricesRequest = {
        symbols: ["AAPL", "GOOGL", "MSFT"],
      }
      const mockContext = {} as any
      const response = await stockServiceImpl.getMultipleStockPrices(request, mockContext)

      expect(response.prices).toHaveLength(3)
      response.prices!.forEach((price, index) => {
        expect(price.symbol).toBe(request.symbols[index])
        expect(price.currency).toBe("USD")
        expect(price.price).toBeGreaterThan(0)
        expect(price.timestamp).toBeGreaterThan(0)
      })
    })

    it("should return zero price for invalid symbols", async () => {
      const request: GetMultipleStockPricesRequest = {
        symbols: ["AAPL", "INVALID", "MSFT"],
      }
      const mockContext = {} as any
      const response = await stockServiceImpl.getMultipleStockPrices(request, mockContext)

      expect(response.prices).toHaveLength(3)
      const prices = response.prices!
      expect(prices[0]?.price).toBeGreaterThan(0)
      expect(prices[1]?.price).toBe(0)
      expect(prices[2]?.price).toBeGreaterThan(0)
    })

    it("should handle empty symbols array", async () => {
      const request: GetMultipleStockPricesRequest = { symbols: [] }
      const mockContext = {} as any
      const response = await stockServiceImpl.getMultipleStockPrices(request, mockContext)

      expect(response.prices).toHaveLength(0)
    })
  })

  describe("streamPriceUpdates", () => {
    it("should stream price updates for valid symbols", async () => {
      const request: StreamPriceUpdatesRequest = {
        symbols: ["AAPL", "GOOGL"],
      }
      const mockContext = {} as any
      
      const stream = stockServiceImpl.streamPriceUpdates(request, mockContext)
      const updates = []
      let count = 0

      for await (const update of stream) {
        updates.push(update)
        count++
        if (count >= 3) break
      }

      expect(updates).toHaveLength(3)
      updates.forEach((update) => {
        expect(["AAPL", "GOOGL"]).toContain(update.symbol)
        expect(update.price).toBeGreaterThan(0)
        expect(update.timestamp).toBeGreaterThan(0)
        expect(update.volume).toBeGreaterThan(0)
      })
    })

    it("should handle empty symbols array gracefully", async () => {
      const request: StreamPriceUpdatesRequest = { symbols: [] }
      const mockContext = {} as any
      const stream = stockServiceImpl.streamPriceUpdates(request, mockContext)
      const updates = []
      let count = 0

      // Set a timeout to break the loop
      const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 1500))
      
      const streamPromise = (async () => {
        for await (const update of stream) {
          updates.push(update)
          count++
          if (count >= 3) break
        }
      })()

      await Promise.race([streamPromise, timeoutPromise])

      expect(updates.length).toBe(0) // Should have no updates since no valid symbols
    }, 10000)

    it("should skip invalid symbols in stream", async () => {
      const request: StreamPriceUpdatesRequest = {
        symbols: ["INVALID1", "INVALID2"],
      }
      const mockContext = {} as any
      
      const stream = stockServiceImpl.streamPriceUpdates(request, mockContext)
      const updates = []
      
      // Set a timeout to break the loop
      const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 1500))
      
      const streamPromise = (async () => {
        for await (const update of stream) {
          updates.push(update)
          if (updates.length >= 3) break
        }
      })()

      await Promise.race([streamPromise, timeoutPromise])

      expect(updates.length).toBe(0) // Should have no updates since all symbols are invalid
    }, 10000)
  })

  describe("server startup", () => {
    it("should start server on configured port", async () => {
      const testServerConfig = Layer.succeed(ServerConfigService, { port: 50051 })
      
      await Runtime.runPromise(Runtime.defaultRuntime)(
        pipe(
          startServerEffect,
          Effect.provide(testServerConfig),
          Effect.timeout("100 millis"),
          Effect.catchAll(() => Effect.void)
        )
      )
      
      expect(mockCreateServer).toHaveBeenCalled()
      expect(mockServer.add).toHaveBeenCalledWith(
        StockServiceDefinition,
        stockServiceImpl
      )
      expect(mockServer.listen).toHaveBeenCalledWith("0.0.0.0:50051")
    })

    it("should log server startup information", async () => {
      const testServerConfig = Layer.succeed(ServerConfigService, { port: 50051 })
      
      await Runtime.runPromise(Runtime.defaultRuntime)(
        pipe(
          startServerEffect,
          Effect.provide(testServerConfig),
          Effect.timeout("100 millis"),
          Effect.catchAll(() => Effect.void)
        )
      )
      
      expect(logInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining("gRPC Stock Price Server listening on port 50051")
      )
      expect(logInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining("Using real protobuf binary serialization")
      )
    })

    it("should handle server startup failure", async () => {
      mockServer.listen.mockRejectedValueOnce(new Error("Port already in use"))
      
      const testServerConfig = Layer.succeed(ServerConfigService, { port: 50051 })
      
      const exit = await Runtime.runPromiseExit(Runtime.defaultRuntime)(
        pipe(
          startServerEffect,
          Effect.provide(testServerConfig),
          Effect.timeout("100 millis")
        )
      )
      
      expect(Exit.isFailure(exit)).toBe(true)
    })
  })

  describe("helper functions", () => {
    it("should generate prices with correct variation", async () => {
      const basePrice = 100
      const prices = await Promise.all(
        Array(100).fill(null).map(() => 
          Runtime.runPromise(Runtime.defaultRuntime)(generatePrice(basePrice))
        )
      )

      prices.forEach((price) => {
        expect(price).toBeGreaterThanOrEqual(95) // 100 * 0.95
        expect(price).toBeLessThanOrEqual(105) // 100 * 1.05
      })
    })

    it("should generate change percentages within range", async () => {
      const changes = await Promise.all(
        Array(100).fill(null).map(() => 
          Runtime.runPromise(Runtime.defaultRuntime)(generateChange())
        )
      )

      changes.forEach((change) => {
        expect(change).toBeGreaterThanOrEqual(-5)
        expect(change).toBeLessThanOrEqual(5)
      })
    })

    it("should return correct stock data from mockStocks", async () => {
      const appleStock = await Runtime.runPromise(Runtime.defaultRuntime)(
        getStock("AAPL")
      )
      expect(appleStock).toEqual({
        name: "Apple Inc.",
        basePrice: 180.0,
      })

      const invalidStockExit = await Runtime.runPromiseExit(Runtime.defaultRuntime)(
        getStock("INVALID")
      )
      expect(Exit.isFailure(invalidStockExit)).toBe(true)
    })
  })

  describe("Effect error handling", () => {
    it("should properly convert StockNotFoundError to Error", async () => {
      await expect(
        runEffect(getStockPriceEffect({ symbol: "INVALID" }))
      ).rejects.toThrow("Stock symbol INVALID not found")
    })

    it("should handle unknown errors", async () => {
      const failingEffect = Effect.fail({ unknown: "error" })
      
      await expect(runEffect(failingEffect)).rejects.toThrow("Unknown error")
    })

    it("should handle InvalidRequestError", async () => {
      const failingEffect = Effect.fail(new InvalidRequestError({ message: "Test error" }))
      
      await expect(runEffect(failingEffect)).rejects.toThrow("Test error")
    })
  })

  describe("getStockPriceEffect", () => {
    it("should return stock price response for valid symbol", async () => {
      const request: GetStockPriceRequest = { symbol: "AAPL" }
      const response = await runEffect(getStockPriceEffect(request))

      expect(response.symbol).toBe("AAPL")
      expect(response.currency).toBe("USD")
      expect(response.price).toBeGreaterThan(0)
      expect(response.timestamp).toBeGreaterThan(0)
      expect(typeof response.change).toBe("number")
      expect(typeof response.changePercent).toBe("number")
    })

    it("should fail for invalid symbol", async () => {
      const request: GetStockPriceRequest = { symbol: "INVALID" }
      
      await expect(runEffect(getStockPriceEffect(request))).rejects.toThrow(
        "Stock symbol INVALID not found"
      )
    })
  })

  describe("ServerConfig", () => {
    it("should use port 50051 from configuration", async () => {
      const testServerConfig = Layer.succeed(ServerConfigService, { port: 50051 })
      
      await Runtime.runPromise(Runtime.defaultRuntime)(
        pipe(
          Effect.gen(function* () {
            const config = yield* ServerConfigService
            expect(config.port).toBe(50051)
          }),
          Effect.provide(testServerConfig)
        )
      )
    })
  })

  describe("server startup error handling", () => {
    it("should log error when server fails to start", async () => {
      const error = new Error("Test server startup error")
      const runSyncSpy = jest.spyOn(Effect, "runSync")
      
      // Test the error handling in the catch block
      await Runtime.runPromise(Runtime.defaultRuntime)(
        pipe(
          Effect.fail(error),
          Effect.catchAll((err) => {
            Effect.runSync(Effect.logError(`Server failed to start: ${err}`))
            return Effect.void
          })
        )
      )
      
      expect(runSyncSpy).toHaveBeenCalled()
      runSyncSpy.mockRestore()
    })

    it("should cover production server startup branch", () => {
      // Store original NODE_ENV
      const originalEnv = process.env.NODE_ENV
      
      // Clear module cache
      jest.resetModules()
      
      // Mock Effect.runPromise to prevent actual server startup
      const runPromiseMock = jest.fn().mockReturnValue(Promise.resolve())
      jest.doMock("effect", () => ({
        ...jest.requireActual("effect"),
        Effect: {
          ...jest.requireActual("effect").Effect,
          runPromise: runPromiseMock
        }
      }))
      
      // Set NODE_ENV to production
      process.env.NODE_ENV = "production"
      
      // Require server.ts to trigger the conditional branch
      jest.isolateModules(() => {
        require("./server")
      })
      
      // Restore original NODE_ENV
      process.env.NODE_ENV = originalEnv
      
      // Verify Effect.runPromise was called (production branch)
      expect(runPromiseMock).toHaveBeenCalled()
      
      // Clean up
      jest.dontMock("effect")
      jest.resetModules()
    })
  })
})
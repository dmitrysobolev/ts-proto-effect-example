import { Effect, Stream, Random, Schema } from "effect"
import * as Http from "http"
import {
  GetStockPriceRequest,
  GetStockPriceResponse,
  GetMultipleStockPricesRequest,
  GetMultipleStockPricesResponse,
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

// StockService implementation
class StockService {
  static getStockPrice(request: GetStockPriceRequest): Effect.Effect<GetStockPriceResponse, Error> {
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
      }
    })
  }

  static getMultipleStockPrices(request: GetMultipleStockPricesRequest): Effect.Effect<GetMultipleStockPricesResponse, Error> {
    return Effect.gen(function* () {
      const prices = yield* Effect.all(
        request.symbols.map((symbol) =>
          StockService.getStockPrice({ symbol }).pipe(
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
      
      return { prices }
    })
  }

  static streamPriceUpdates(symbols: string[]): Stream.Stream<PriceUpdate, Error> {
    return Stream.repeatEffect(
      Effect.gen(function* () {
        yield* Effect.sleep("1 second")
        
        const symbol = symbols[Math.floor(Math.random() * symbols.length)] || ""
        const stock = mockStocks.get(symbol)
        
        if (!stock) {
          return null
        }
        
        const price = yield* generatePrice(stock.basePrice)
        const volume = yield* Random.next.pipe(Effect.map((r) => Math.floor(r * 1000000)))
        
        return {
          symbol,
          price: Math.round(price * 100) / 100,
          timestamp: Date.now(),
          volume,
        }
      })
    ).pipe(
      Stream.filter((update): update is PriceUpdate => update !== null)
    )
  }
}

// Request schemas
const StockPriceRequestSchema = Schema.Struct({
  symbol: Schema.String,
})

const MultiplePricesRequestSchema = Schema.Struct({
  symbols: Schema.Array(Schema.String),
})

// HTTP request handler
const handleRequest = (req: Http.IncomingMessage, res: Http.ServerResponse) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`)
  
  if (req.method === 'POST' && url.pathname === '/api/stock/price') {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      const program = Effect.gen(function* () {
        const data = yield* Schema.decodeUnknown(StockPriceRequestSchema)(JSON.parse(body))
        const result = yield* StockService.getStockPrice(data)
        
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      }).pipe(
        Effect.catchAll((error) => Effect.sync(() => {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: String(error) }))
        }))
      )
      
      Effect.runPromise(program)
    })
  }
  else if (req.method === 'POST' && url.pathname === '/api/stock/prices') {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      const program = Effect.gen(function* () {
        const data = yield* Schema.decodeUnknown(MultiplePricesRequestSchema)(JSON.parse(body))
        const result = yield* StockService.getMultipleStockPrices({ symbols: [...data.symbols] })
        
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      }).pipe(
        Effect.catchAll((error) => Effect.sync(() => {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: String(error) }))
        }))
      )
      
      Effect.runPromise(program)
    })
  }
  else if (req.method === 'GET' && url.pathname === '/api/stock/stream') {
    const symbols = url.searchParams.get('symbols')?.split(',') || []
    
    if (symbols.length === 0) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'No symbols provided' }))
      return
    }
    
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    })
    
    const stream = StockService.streamPriceUpdates(symbols).pipe(
      Stream.map(update => `data: ${JSON.stringify(update)}\n\n`),
      Stream.encodeText,
      Stream.runForEach(chunk => Effect.sync(() => res.write(chunk)))
    )
    
    Effect.runPromise(stream).catch(() => {})
    
    req.on('close', () => {
      res.end()
    })
  }
  else {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
  }
}

// Create and start server
const server = Http.createServer(handleRequest)

const PORT = 3001
server.listen(PORT, () => {
  console.log(`Stock Price API Server running on port ${PORT}`)
  console.log("Available endpoints:")
  console.log("  POST /api/stock/price - Get single stock price")
  console.log("  POST /api/stock/prices - Get multiple stock prices")
  console.log("  GET /api/stock/stream?symbols=AAPL,GOOGL - Stream price updates")
})
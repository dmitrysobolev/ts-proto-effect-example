# TypeScript Protobuf with Effect Example

This project demonstrates how to use Protocol Buffers (protobuf) with TypeScript and the Effect library to build a simple stock price API.

## Features

- **Protocol Buffers**: Type-safe message serialization
- **Effect**: Functional programming with powerful error handling and streaming
- **TypeScript**: Full type safety across the stack
- **HTTP Server/Client**: RESTful API with streaming support

## Project Structure

```
├── proto/
│   └── stock.proto          # Protobuf schema definition
├── src/
│   ├── generated/           # Generated TypeScript code from protobuf
│   │   └── proto/
│   │       └── stock.ts
│   ├── server.ts           # HTTP server implementation
│   ├── client.ts           # HTTP client library (StockClient class)
│   └── example.ts          # Example usage demonstrating all features
├── package.json
└── tsconfig.json
```

## API Endpoints

The server provides three endpoints:

1. **Get Single Stock Price**
   - `POST /api/stock/price`
   - Body: `{ "symbol": "AAPL" }`

2. **Get Multiple Stock Prices**
   - `POST /api/stock/prices`
   - Body: `{ "symbols": ["AAPL", "GOOGL", "MSFT"] }`

3. **Stream Price Updates**
   - `GET /api/stock/stream?symbols=AAPL,GOOGL`
   - Returns Server-Sent Events stream

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Generate TypeScript code from protobuf:
   ```bash
   npm run proto:generate
   ```

3. Start the server:
   ```bash
   npm run server
   ```

4. In another terminal, run the client example:
   ```bash
   npm run example
   ```

## How It Works

### Protobuf Schema

The `stock.proto` file defines the service and message types:
- `StockService`: The gRPC service definition
- Request/Response messages for each RPC method

### Server Implementation

The server uses Effect to:
- Handle HTTP requests with type-safe routing
- Generate mock stock prices with random fluctuations
- Stream real-time updates using Server-Sent Events

### Client Implementation

The client demonstrates:
- Type-safe HTTP requests using Effect
- Response validation with schemas
- Streaming data consumption
- Error handling with Effect

### Effect Integration

Effect provides:
- Composable error handling
- Resource management (scoped HTTP connections)
- Stream processing for real-time data
- Dependency injection with layers

## Available Scripts

- `npm run proto:generate` - Generate TypeScript from protobuf files
- `npm run build` - Compile TypeScript
- `npm run server` - Start the HTTP server
- `npm run example` - Run the example client

## Mock Data

The server includes mock data for these stock symbols:
- AAPL (Apple)
- GOOGL (Alphabet)
- MSFT (Microsoft)
- AMZN (Amazon)
- TSLA (Tesla)

Prices fluctuate randomly by ±5% from their base values.
# TypeScript gRPC with Protobuf and Effect Example

This project demonstrates how to use gRPC with Protocol Buffers (protobuf) and the Effect library in TypeScript to build a stock price API.

## Features

- **gRPC**: High-performance RPC framework using HTTP/2
- **Protocol Buffers**: Binary serialization for efficient data transfer
- **Effect**: Functional programming with powerful error handling and streaming
- **TypeScript**: Full type safety with generated types from protobuf
- **Streaming**: Real-time price updates using gRPC server streaming

## Project Structure

```
├── proto/
│   └── stock.proto          # Protobuf schema definition
├── src/
│   ├── generated/           # Generated TypeScript code from protobuf
│   │   └── proto/
│   │       └── stock.ts
│   ├── server.ts           # gRPC server implementation
│   ├── client.ts           # gRPC client library (StockGrpcClient class)
│   └── example.ts          # Example usage demonstrating all features
├── package.json
└── tsconfig.json
```

## gRPC Service Methods

The server runs on port 50051 and provides three gRPC methods:

1. **GetStockPrice** (Unary RPC)
   - Request: `{ symbol: "AAPL" }`
   - Response: Stock price information

2. **GetMultipleStockPrices** (Unary RPC)
   - Request: `{ symbols: ["AAPL", "GOOGL", "MSFT"] }`
   - Response: Array of stock prices

3. **StreamPriceUpdates** (Server Streaming RPC)
   - Request: `{ symbols: ["AAPL", "GOOGL"] }`
   - Response: Stream of real-time price updates

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Generate TypeScript code from protobuf:
   ```bash
   npm run proto:generate
   ```

3. Start the gRPC server:
   ```bash
   npm run server
   ```

4. In another terminal, run the example client:
   ```bash
   npm run example
   ```

## How It Works

### Protobuf Schema

The `stock.proto` file defines:
- Service definition with RPC methods
- Request/Response message types
- Uses binary serialization (not JSON)

### Server Implementation

The gRPC server:
- Uses `@grpc/grpc-js` for the gRPC implementation
- Loads protobuf definitions dynamically
- Provides mock stock data with random price fluctuations
- Supports streaming for real-time updates

### Client Implementation

The client uses Effect to provide:
- Type-safe gRPC method calls
- Error handling with Effect
- Stream processing for real-time data
- Resource cleanup with `close()` method

## Available Scripts

- `npm run proto:generate` - Generate TypeScript from protobuf files
- `npm run build` - Compile TypeScript
- `npm run server` - Start the gRPC server
- `npm run example` - Run the example client

## Mock Data

The server includes mock data for these stock symbols:
- AAPL (Apple)
- GOOGL (Alphabet)
- MSFT (Microsoft)
- AMZN (Amazon)
- TSLA (Tesla)

Prices fluctuate randomly by ±5% from their base values.

## Why gRPC with Protobuf?

- **Binary serialization**: More efficient than JSON
- **Strong typing**: Generated TypeScript types from proto files
- **Streaming support**: Built-in support for server/client streaming
- **Performance**: HTTP/2 with multiplexing and header compression
- **Cross-language**: Can generate clients for multiple languages
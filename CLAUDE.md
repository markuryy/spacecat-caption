# SpaceCat Caption Developer Guide

## Build & Development Commands
- `npm run dev` - Run development server
- `npm run build` - Build the application
- `npm run tauri` - Run Tauri-specific commands
- `cargo test` - Run Rust tests
- `cargo clippy` - Lint Rust code
- `tsc` - Type-check TypeScript code

## Code Style Guidelines
- **TypeScript**: Use explicit types, prefer interfaces over type aliases
- **React**: Use functional components with hooks, avoid class components
- **Imports**: Group imports by source (React, libraries, local)
- **Error Handling**: Use try/catch with specific error messages
- **Naming**: camelCase for variables/functions, PascalCase for components/types
- **Component Structure**: Props interface at top, followed by hooks, handlers, and finally JSX
- **Rust**: Follow standard Rust style with error propagation using `?`
- **Documentation**: JSDoc for TypeScript functions, documentation comments for Rust
- **API Calls**: Always handle loading states and errors
- **File Structure**: Group related files by feature not by type
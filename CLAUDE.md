# spacecat caption Developer Guide

## Build & Development Commands
- `bun run tauri dev` - Run development server

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

## Frontend Guidelines
- **Toasts**: Use `sonner` for toasts, for errors only. **No success toasts.**
- **Success**: Indicate success directly via the UI components natural state; the user can usually see if something worked, because it will have worked. If it's not something visible, like saving settings, a sonner could work but a checkmark with the text "saved" that auto-dismisses can be equally effective, without the visual clutter of a full sonner.

# CursorRules

This document outlines important rules and best practices to follow when working on this project.

## Dependency Management

### JavaScript/TypeScript Dependencies
- **NEVER** directly edit package.json to add/remove dependencies
- Always use the appropriate package manager commands
- Prefer `bun add <package>` over npm for adding dependencies
- For dev dependencies, use `bun add -d <package>`

### Rust Dependencies
- **NEVER** directly edit Cargo.toml to add/remove dependencies
- Always use `cargo add <crate>` to add dependencies
- For dev dependencies, use `cargo add --dev <crate>`
- For specific versions, use `cargo add <crate>@<version>`
- For features, use `cargo add <crate> --features <feature1,feature2>`

## Code Style and Practices

- Follow the existing code style and patterns in the project
- Use TypeScript types appropriately in frontend code
- Document public functions and interfaces with JSDoc or rustdoc comments
- Handle errors appropriately in both frontend and backend code
- Use async/await for asynchronous operations

## Tauri-Specific Rules

- Use the Tauri API for file system operations instead of direct Node.js APIs
- Follow the Tauri security model and avoid unnecessary permissions
- Use the asset protocol for accessing media files when appropriate
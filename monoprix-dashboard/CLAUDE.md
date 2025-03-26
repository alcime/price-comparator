# CLAUDE.md - Guidelines for Agentic Coding

## Build & Run Commands
- `npm run dev` - Start development server (Vite)
- `npm run server` - Start backend server
- `npm run dev:all` - Start both frontend and backend with concurrently
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build

## Code Style Guidelines
- **Imports**: Use path aliases with `@/` prefix (e.g., `import Button from '@/components/ui/button'`)
- **Components**: Use functional components with React hooks
- **Formatting**: Follow ESLint configuration, React JSX runtime syntax
- **Naming**:
  - Components: PascalCase (e.g., `GroceryDashboard.jsx`)
  - Variables/functions: camelCase
  - Files: kebab-case for utilities, PascalCase for components
- **Project Structure**:
  - UI components in `src/components/ui/`
  - Feature components in `src/components/`
  - Utility functions in `src/lib/`
- **State Management**: Use React hooks (useState, useEffect)
- **Error Handling**: Use try/catch blocks for async operations
- **API Calls**: Use the utils or claude-client in `src/lib/`

## Technologies
React 18, Vite, TailwindCSS, shadcn/ui components, Express backend
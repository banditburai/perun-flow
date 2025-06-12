# Contributing to perun-flow

Thank you for your interest in contributing to perun-flow! This guide will help you get started.

## Development Setup

### Prerequisites

- Node.js 18.x or higher
- Git

### Initial Setup

1. Clone the repository:

   ```bash
   git clone https://github.com/banditburai/perun-flow.git
   cd perun-flow
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Run tests to verify setup:
   ```bash
   npm test
   ```

## Code Quality Tools

This project uses several tools to maintain code quality:

### Pre-commit Hooks

We use Husky and lint-staged to automatically check code before commits:

- **ESLint**: Catches code errors and enforces style rules
- **Prettier**: Formats code consistently
- **Tests**: Runs tests for modified files

The pre-commit hook runs automatically when you commit. To run checks manually:

```bash
# Check formatting
npm run format:check

# Fix formatting
npm run format

# Run linting
npm run lint

# Fix linting issues
npm run lint:fix
```

### Pre-push Hook

Before pushing, all tests are run automatically to ensure nothing is broken.

## Development Workflow

1. Create a new branch for your feature:

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes and commit:

   ```bash
   git add .
   git commit -m "feat: add new feature"
   ```

3. Push your branch and create a pull request:
   ```bash
   git push origin feature/your-feature-name
   ```

## Commit Message Convention

We follow conventional commits. Format: `type(scope): message`

Types:

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Formatting, missing semicolons, etc.
- `refactor`: Code restructuring without changing behavior
- `test`: Adding or modifying tests
- `chore`: Maintenance tasks

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e
```

## Project Structure

```
perun-flow/
├── src/
│   ├── core/          # Core business logic
│   ├── mcp/           # MCP server implementation
│   ├── storage/       # File and graph storage
│   └── utils/         # Utility functions
├── tests/
│   ├── unit/          # Unit tests
│   ├── integration/   # Integration tests
│   └── e2e/           # End-to-end tests
└── docs/              # Documentation
```

## Code Style Guidelines

- Use ES6+ features
- Prefer async/await over callbacks
- Add JSDoc comments for public APIs
- Keep functions small and focused
- Write tests for new features

## Troubleshooting

### Lint errors on commit

If you see lint errors when committing:

1. Run `npm run lint:fix` to auto-fix issues
2. Manually fix any remaining errors
3. Run `npm run format` to ensure formatting

### Tests failing on push

If tests fail when pushing:

1. Run `npm test` locally to see failures
2. Fix the failing tests
3. Ensure all tests pass before pushing

## Questions?

If you have questions or need help, please:

1. Check existing issues on GitHub
2. Create a new issue with your question
3. Join our discussions

Thank you for contributing!

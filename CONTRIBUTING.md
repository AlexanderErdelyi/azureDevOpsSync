# Contributing to Azure DevOps Work Item Sync

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/your-username/azureDevOpsSync.git
   cd azureDevOpsSync
   ```
3. Install dependencies:
   ```bash
   npm install
   ```

## Development Setup

### Environment Variables

Create a `.env` file for local development:

```bash
cp .env.example .env
# Edit .env with your Azure DevOps credentials
```

### Running the Application

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

### Project Structure

```
azureDevOpsSync/
├── server.js              # Express server
├── package.json           # Dependencies
├── lib/
│   └── azureDevOpsClient.js  # Azure DevOps API wrapper
├── routes/
│   └── sync.js           # API endpoints
├── public/
│   ├── index.html        # Web interface
│   ├── styles.css        # Styles
│   └── app.js            # Frontend logic
└── mcp/
    └── server.js         # MCP server
```

## Making Changes

### Code Style

- Use consistent indentation (2 spaces)
- Follow existing code style
- Add comments for complex logic
- Use meaningful variable names

### Adding Features

1. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes

3. Test your changes thoroughly

4. Commit with descriptive messages:
   ```bash
   git commit -m "Add feature: description"
   ```

5. Push to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

6. Open a Pull Request

### Adding API Endpoints

1. Add route handler in `routes/sync.js`
2. Update API documentation in README
3. Test endpoint with curl or Postman

Example:
```javascript
router.post('/new-endpoint', async (req, res) => {
  try {
    // Your logic here
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

### Adding MCP Tools

1. Add tool definition to `TOOLS` array in `mcp/server.js`
2. Add handler in `executeTool` function
3. Update MCP documentation

Example:
```javascript
// Tool definition
{
  name: 'new_tool',
  description: 'Description of what the tool does',
  inputSchema: {
    type: 'object',
    properties: {
      param1: {
        type: 'string',
        description: 'Parameter description'
      }
    },
    required: ['param1']
  }
}

// Handler
case 'new_tool': {
  // Your logic here
  return {
    success: true,
    result: data
  };
}
```

## Testing

### Manual Testing

1. Start the server
2. Open http://localhost:3000
3. Test all functionality:
   - Connection test
   - Work item sync
   - Error handling

### API Testing

Use curl to test endpoints:

```bash
# Test health endpoint
curl http://localhost:3000/health

# Test sync endpoint
curl -X POST http://localhost:3000/api/sync \
  -H "Content-Type: application/json" \
  -d '{"orgUrl":"...","token":"...","sourceProject":"...","targetProject":"..."}'
```

### MCP Testing

Test MCP server with echo:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | node mcp/server.js
```

## Pull Request Guidelines

### Before Submitting

- [ ] Code follows project style
- [ ] All features are tested
- [ ] Documentation is updated
- [ ] No breaking changes (or clearly documented)
- [ ] Commit messages are descriptive

### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Performance improvement

## Testing
How the changes were tested

## Screenshots
If applicable, add screenshots
```

## Reporting Issues

### Bug Reports

Include:
- Description of the bug
- Steps to reproduce
- Expected behavior
- Actual behavior
- Environment (OS, Node version, etc.)

### Feature Requests

Include:
- Description of the feature
- Use case
- Proposed implementation (optional)

## Code Review Process

1. Maintainers will review your PR
2. Address any feedback
3. Once approved, changes will be merged

## Questions?

Feel free to open an issue for questions or discussion.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

# PAKE+ System Monorepo

> **Personal Autonomous Knowledge Engine Plus** - Modern monorepo architecture for comprehensive knowledge management and automation.

## 🏗️ Architecture Overview

This monorepo contains the complete PAKE+ System, organized using modern development practices with Turbo for build orchestration and TypeScript for type safety.

```
pake-plus-monorepo/
├── apps/                     # Application code
│   ├── api/                 # REST API service (Node.js/Express)
│   ├── frontend/            # Web interface (Next.js/React)
│   ├── automation/          # Python automation services
│   ├── workers/             # Background job processors
│   └── social-automation/   # Social media automation toolkit
├── packages/                # Shared libraries
│   ├── database/           # Database schemas & repositories
│   ├── common/             # Shared utilities
│   ├── types/              # TypeScript type definitions
│   └── config/             # Configuration management
├── infrastructure/         # DevOps & deployment
├── docs/                  # Documentation
├── tests/                 # Integration & E2E tests
├── vault/                 # Knowledge management data
└── tools/                 # Development tools & scripts
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18.0.0 or higher
- **npm** 8.0.0 or higher  
- **Python** 3.11+ (for automation services)
- **Docker** (for infrastructure services)

### Installation

```bash
# Clone and install dependencies
git clone <repository-url>
cd pake-plus-monorepo
npm install

# Start development environment
npm run dev
```

## 📦 Available Scripts

### Development
```bash
npm run dev          # Start all services in development mode
npm run build        # Build all applications
npm run test         # Run all tests
npm run lint         # Lint all code
npm run type-check   # TypeScript type checking
```

### Testing
```bash
npm run test:unit        # Unit tests
npm run test:integration # Integration tests  
npm run test:e2e         # End-to-end tests
```

### Security
```bash
npm run security:audit   # Security vulnerability audit
npm run security:scan    # Credential security scan
```

## 🏗️ Applications

### API Service (`apps/api`)
RESTful API service built with Node.js, Express, and TypeScript.

**Key Features:**
- JWT-based authentication
- Rate limiting and security middleware
- Comprehensive error handling
- OpenAPI documentation
- Redis caching
- PostgreSQL integration

**Start:** `cd apps/api && npm run dev`

### Frontend (`apps/frontend`)
Modern web interface built with Next.js, React, and TypeScript.

**Key Features:**
- Server-side rendering
- Component library integration
- Responsive design
- Authentication integration
- Real-time updates

**Start:** `cd apps/frontend && npm run dev`

### Automation Services (`apps/automation`)
Python-based automation and AI services.

**Key Features:**
- Knowledge processing workflows
- AI/ML integration
- Background task processing
- Multi-source data ingestion
- Vector database operations

**Start:** `cd apps/automation && python -m src.main`

## 📚 Packages

### Database (`packages/database`)
Shared database schemas, migrations, and repository patterns.

### Common (`packages/common`)
Shared utilities, constants, and middleware used across applications.

### Types (`packages/types`)
TypeScript type definitions shared across the monorepo.

### Config (`packages/config`)
Centralized configuration management for all environments.

## 🏗️ Infrastructure

### Docker Services
- **PostgreSQL 16** with pgvector extension
- **Redis 7** for caching and queues
- **n8n** for workflow automation
- **Nginx** for reverse proxy

**Start:** `docker-compose up -d`

### Environment Configuration
Copy and configure environment files:
```bash
cp .env.example .env
# Edit .env with your configuration
```

## 🧪 Testing

### Test Organization
- **Unit tests**: `**/*.test.{ts,js}`
- **Integration tests**: `tests/integration/**`
- **E2E tests**: `tests/e2e/**`

### Running Tests
```bash
# All tests
npm run test

# Specific test types
npm run test:unit
npm run test:integration
npm run test:e2e

# With coverage
npm run test -- --coverage
```

## 🔒 Security

### Security Measures
- Environment-based credential management
- Pre-commit hooks for security validation
- Regular dependency vulnerability scanning
- Automated credential auditing
- Git security enforcement

### Security Commands
```bash
# Run security audit
npm run security:audit

# Scan for credentials
npm run security:scan

# Check security compliance
npm run lint:security
```

## 📖 Documentation

- **[Architecture](docs/architecture/)** - System design and patterns
- **[API Documentation](docs/api/)** - REST API reference
- **[Development Guide](docs/development/)** - Setup and workflows
- **[Deployment Guide](docs/deployment/)** - Production deployment

## 🤝 Contributing

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Follow** coding standards and run tests
4. **Commit** changes (`git commit -m 'feat: add amazing feature'`)
5. **Push** to branch (`git push origin feature/amazing-feature`)
6. **Open** a Pull Request

### Development Guidelines
- Use conventional commit messages
- Maintain test coverage above 80%
- Follow TypeScript strict mode
- Run security checks before commits

## 🔧 Troubleshooting

### Common Issues

**Port Conflicts**
```bash
# Check for port usage
netstat -tulpn | grep -E ':(3000|8000|5432|6379)'
```

**Database Connection Issues**
```bash
# Verify database is running
docker-compose ps
docker-compose logs postgres
```

**Build Failures**
```bash
# Clean and rebuild
npm run clean
npm install
npm run build
```

## 📊 Monitoring

### Health Checks
- API: `http://localhost:3000/health`
- Frontend: `http://localhost:3001`
- Automation: `http://localhost:8000/health`

### Metrics
- Application metrics via Prometheus
- Custom business metrics
- Performance monitoring
- Error tracking

## 🚀 Deployment

### Development
```bash
npm run dev
```

### Staging
```bash
npm run build
npm run deploy:staging
```

### Production
```bash
npm run build:prod
npm run deploy:prod
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Turbo** for monorepo build orchestration
- **TypeScript** for type safety and developer experience
- **Next.js** for the modern React framework
- **FastAPI** for Python API development
- **Docker** for containerization

---

**PAKE+ System Monorepo** - Modern, secure, and scalable knowledge management platform.

🔗 **Status**: Phase 2 Complete ✅ - Modern Monorepo Architecture  
📅 **Last Updated**: 2025-09-03  
🚀 **Version**: 2.0.0

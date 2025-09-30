#!/bin/bash

# SuperCharts Docker Build Script
# This script helps build and manage Docker containers for the application

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
COMPOSE_FILE="docker-compose.yml"
ENV_FILE=".env"

# Functions
print_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -e, --external    Use external database configuration"
    echo "  -b, --build       Build Docker images"
    echo "  -u, --up          Start containers"
    echo "  -d, --down        Stop containers"
    echo "  -l, --logs        Show container logs"
    echo "  -r, --restart     Restart containers"
    echo "  -c, --clean       Clean up volumes and images"
    echo "  -h, --help        Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --build --up           # Build and start with local database"
    echo "  $0 --external --up        # Start with external database"
    echo "  $0 --logs                 # Show container logs"
    echo "  $0 --down --clean         # Stop and clean up"
}

check_env_file() {
    if [ ! -f "$ENV_FILE" ]; then
        echo -e "${YELLOW}Warning: $ENV_FILE not found. Creating from template...${NC}"
        if [ -f ".env.template" ]; then
            cp .env.template .env
            echo -e "${GREEN}Created .env file. Please update it with your configuration.${NC}"
            echo -e "${YELLOW}Edit .env file and run the script again.${NC}"
            exit 1
        else
            echo -e "${RED}Error: .env.template not found!${NC}"
            exit 1
        fi
    fi
}

build_images() {
    echo -e "${GREEN}Building Docker images...${NC}"
    docker-compose -f "$COMPOSE_FILE" build
}

start_containers() {
    echo -e "${GREEN}Starting containers...${NC}"
    docker-compose -f "$COMPOSE_FILE" up -d
    echo -e "${GREEN}Containers started successfully!${NC}"
    echo ""
    echo "Application should be available at: http://localhost:${APP_PORT:-3000}"
}

stop_containers() {
    echo -e "${YELLOW}Stopping containers...${NC}"
    docker-compose -f "$COMPOSE_FILE" down
}

show_logs() {
    docker-compose -f "$COMPOSE_FILE" logs -f
}

restart_containers() {
    echo -e "${YELLOW}Restarting containers...${NC}"
    docker-compose -f "$COMPOSE_FILE" restart
}

clean_up() {
    echo -e "${RED}Cleaning up Docker resources...${NC}"
    docker-compose -f "$COMPOSE_FILE" down -v
    docker system prune -f
}

# Parse command line arguments
if [ $# -eq 0 ]; then
    print_usage
    exit 0
fi

# Change to docker directory
cd "$(dirname "$0")"

while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--external)
            COMPOSE_FILE="docker-compose.external-db.yml"
            shift
            ;;
        -b|--build)
            check_env_file
            build_images
            shift
            ;;
        -u|--up)
            check_env_file
            start_containers
            shift
            ;;
        -d|--down)
            stop_containers
            shift
            ;;
        -l|--logs)
            show_logs
            shift
            ;;
        -r|--restart)
            restart_containers
            shift
            ;;
        -c|--clean)
            clean_up
            shift
            ;;
        -h|--help)
            print_usage
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            print_usage
            exit 1
            ;;
    esac
done
# Hướng dẫn sử dụng Docker cho Dự Án

Tài liệu này hướng dẫn cách sử dụng Docker để chạy PostgreSQL, Redis, và Worker cho dự án krok-api.

## Tại sao nên dùng Docker?

- ✅ Không cần cài đặt các service (PostgreSQL, Redis, Python) trực tiếp trên máy
- ✅ Dễ dàng khởi động, dừng, và quản lý các services
- ✅ Cấu hình nhất quán giữa các môi trường (dev, staging, production)
- ✅ Dễ dàng xóa và tạo lại database/cache
- ✅ Worker có thể xử lý karaoke job một cách độc lập
- ✅ Không ảnh hưởng đến các instances khác trên máy

## Yêu cầu

- **Docker** đã được cài đặt
- **Docker Compose** (thường đi kèm với Docker Desktop)

### Cài đặt Docker

**macOS:**

```bash
# Sử dụng Homebrew
brew install --cask docker

# Hoặc tải Docker Desktop từ:
# https://www.docker.com/products/docker-desktop
```

**Linux (Ubuntu/Debian):**

```bash
# Cài đặt Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Cài đặt Docker Compose
sudo apt-get update
sudo apt-get install docker-compose-plugin

# Thêm user vào docker group để chạy không cần sudo
sudo usermod -aG docker $USER
```

**Windows:**

- Tải và cài đặt [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop)

## Cấu hình Docker Compose

File `docker-compose.yml` đã được tạo sẵn trong thư mục gốc của dự án với 3 services:

1. **postgres** - PostgreSQL database
2. **redis** - Redis cache/queue
3. **worker** - Node.js + Python worker cho karaoke processing

### Services trong docker-compose.yml

#### PostgreSQL

```yaml
postgres:
  ports:
    - '5432:5432'
  image: postgres:16-alpine
  container_name: krok-postgres
  environment:
    POSTGRES_DB: krok
    POSTGRES_USER: kwong2000
    POSTGRES_PASSWORD: 1234abcd
  volumes:
    - postgres_data:/var/lib/postgresql/data
```

**Thông tin kết nối:**

- **Port**: `5432`
- **Host**: `localhost`
- **Database**: `krok`
- **Username**: `kwong2000`
- **Password**: `1234abcd`

**Connection String cho .env:**

```env
DATABASE_URL="postgresql://kwong2000:1234abcd@localhost:5432/krok"
```

#### Redis

```yaml
redis:
  ports:
    - '6379:6379'
  image: redis:7-alpine
  container_name: krok-redis
  environment:
    REDIS_PASSWORD: ${REDIS_PASSWORD}
  command: ['sh', '-c', 'redis-server --requirepass "$REDIS_PASSWORD"']
```

**Thông tin kết nối:**

- **Port**: `6379`
- **Host**: `localhost`
- **Password**: Từ `REDIS_PASSWORD` trong `.env`

**Lưu ý:** Redis dùng cho BullMQ queue xử lý karaoke jobs

#### Worker

```yaml
worker:
  container_name: krok-worker
  build:
    context: .
    dockerfile: worker/Dockerfile
  depends_on:
    redis:
      condition: service_healthy
    postgres:
      condition: service_healthy
  environment:
    REDIS_HOST: redis # (override) dùng service name
    REDIS_PORT: 6379
    REDIS_PASSWORD: ${REDIS_PASSWORD}
    DATABASE_URL: postgresql://kwong2000:1234abcd@postgres:5432/krok
    KARAOKE_JOB_NAME: ${KARAOKE_JOB_NAME:-process-video}
    KARAOKE_QUEUE_NAME: ${KARAOKE_QUEUE_NAME:-karaoke-processing}
```

**Vai trò:** Xử lý karaoke processing jobs từ queue (lyrics generation, voice separation, etc.)

**Lưu ý:** Worker auto-restart theo `api`, `redis`, `postgres` healthchecks

## Sử dụng

### 1. Khởi động tất cả services (PostgreSQL + Redis + Worker)

```bash
docker-compose up -d
```

- Flag `-d` để chạy ở chế độ background
- Lần đầu tiên sẽ mất vài giây/phút để build worker image và tải images

### 2. Khởi động riêng lẻ

```bash
# Chỉ PostgreSQL
docker-compose up -d postgres

# PostgreSQL + Redis
docker-compose up -d postgres redis

# Thêm worker (phải có postgres + redis trước)
docker-compose up -d postgres redis worker
```

### 3. Kiểm tra trạng thái

```bash
# Xem tất cả containers
docker-compose ps

# Chi tiết:
# - krok-postgres: PostgreSQL database
# - krok-redis: Redis queue
# - krok-worker: Karaoke worker processor
```

### 4. Xem logs

```bash
# Xem tất cả logs realtime
docker-compose logs -f

# Chỉ PostgreSQL
docker-compose logs -f postgres

# Chỉ Redis
docker-compose logs -f redis

# Chỉ Worker
docker-compose logs -f worker
```

### 5. Dừng services

```bash
# Dừng nhưng giữ lại data
docker-compose stop

# Dừng và xóa container (data vẫn được giữ trong volume)
docker-compose down
```

### 6. Khởi động lại

```bash
# Nếu đã stop
docker-compose start

# Hoặc dừng + khởi động lại
docker-compose restart

# Hoặc dùng up lại
docker-compose up -d
```

## Các lệnh hữu ích

### Redis CLI

```bash
# Kết nối vào Redis CLI
docker-compose exec redis redis-cli -a your-redis-password

# Xem các keys trong redis
KEYS *

# Kiểm tra queue karaoke
LLEN karaoke-processing

# Thoát
exit
```

### Kết nối vào PostgreSQL CLI

```bash
# Từ docker-compose
docker-compose exec postgres psql -U kwong2000 -d krok
```

Sau đó bạn có thể chạy SQL commands:

```sql
-- Xem tất cả tables
\dt

-- Xem schema của table
\d users

-- Query
SELECT * FROM users;

-- Thoát
\q
```

### Logs của Worker

```bash
# Xem logs worker realtime
docker-compose logs -f worker

# Nếu worker crash, kiểm tra lỗi
docker-compose logs worker | tail -100
```

**Lưu ý:** Worker sẽ tự restart nếu postgres/redis mất kết nối

### Rebuild Worker image

```bash
# Rebuild từ Dockerfile khi code thay đổi
docker-compose build worker

# Rebuild và restart
docker-compose up -d --build worker
```

### Xóa tất cả data

```bash
# Dừng + xóa containers + volumes (**cảnh báo: xóa data!**)
docker-compose down -v

# Khởi động lại từ đầu
docker-compose up -d

# Chạy lại migrations
npm run prisma:migrate
```

### Backup database

```bash
# Export database ra file
docker-compose exec postgres pg_dump -U kwong2000 krok > backup.sql

# Hoặc với timestamp
docker-compose exec postgres pg_dump -U kwong2000 krok > backup-$(date +%Y%m%d-%H%M%S).sql
```

### Restore database từ backup

```bash
# Import từ file backup
docker-compose exec -T postgres psql -U kwong2000 krok < backup.sql
```

### Thay đổi mật khẩu Redis

Nếu muốn thay đổi mật khẩu Redis, sửa trong `.env`:

```env
# Từ
REDIS_PASSWORD="redis-password"

# Thành
REDIS_PASSWORD="your-new-secure-password"
```

Sau đó restart Redis:

```bash
docker-compose restart redis
```

## Troubleshooting

### Port 5432 (PostgreSQL) đã được sử dụng

**Lỗi:** `Error starting userland proxy: listen tcp4 0.0.0.0:5432: bind: address already in use`

**Nguyên nhân:** Đã có PostgreSQL khác đang chạy trên port 5432

**Giải pháp 1:** Dừng PostgreSQL local

```bash
# macOS
brew services stop postgresql

# Linux
sudo systemctl stop postgresql

# Hoặc tìm và kill process
lsof -i :5432
kill -9 <PID>
```

**Giải pháp 2:** Đổi port trong docker-compose.yml

```yaml
postgres:
  ports:
    - '5433:5432' # Đổi từ 5432 thành 5433
```

Và cập nhật `DATABASE_URL`:

```env
DATABASE_URL="postgresql://kwong2000:1234abcd@localhost:5433/krok"
```

### Port 6379 (Redis) đã được sử dụng

**Lỗi:** `Error starting userland proxy: listen tcp4 0.0.0.0:6379: bind: address already in use`

**Nguyên nhân:** Đã có Redis khác đang chạy trên port 6379

**Giải pháp:**

```bash
# Tìm process đang dùng port 6379
lsof -i :6379

# Kill process
kill -9 <PID>

# Hoặc đổi port trong docker-compose.yml
redis:
  ports:
    - '6380:6379' # Đổi từ 6379 thành 6380
```

### Worker không start hoặc crash

**Lỗi:** Worker container crash hoặc không chạy

**Kiểm tra:**

```bash
# Xem status
docker-compose ps

# Xem logs
docker-compose logs worker

# Kiểm tra dependencies
# - Redis phải sạch + running
# - PostgreSQL phải running
```

**Nguyên nhân thường gặp:**

1. **Worker build fail:** Docker image worker chưa được build đúng

   ```bash
   docker-compose build worker
   docker-compose up -d worker
   ```

2. **Redis/Postgres chưa sẵn sàng:** Worker tries to connect trước khi dependent services healthy

   ```bash
   docker-compose up -d postgres redis
   sleep 10
   docker-compose up -d worker
   ```

3. **Environment variables sai:** Check `.env` có đủ biến không

   ```bash
   grep -E "REDIS_PASSWORD|KARAOKE" .env
   ```

4. **Python dependencies thiếu:** Check worker/Dockerfile
   ```bash
   docker-compose logs worker | grep Error
   ```

### Container không start

```bash
# Xem logs để debug
docker-compose logs postgres

# Xóa và tạo lại
docker-compose down -v
docker-compose up -d
```

### Permission denied khi chạy docker commands

**Linux only:**

```bash
# Thêm user vào docker group
sudo usermod -aG docker $USER

# Logout và login lại
# Hoặc chạy:
newgrp docker
```

### Container chạy nhưng không kết nối được

```bash
# Kiểm tra healthcheck
docker-compose ps

# Nếu unhealthy, xem logs
docker-compose logs postgres

# Test connection PostgreSQL
docker-compose exec postgres pg_isready -U kwong2000

# Test connection Redis
docker-compose exec redis redis-cli -a your-redis-password ping
```

### Data bị mất sau khi restart

**Nguyên nhân:** Chạy `docker-compose down -v` sẽ xóa volumes

**Giải pháp:**

- Chỉ dùng `docker-compose down` (không có flag `-v`)
- Hoặc dùng `docker-compose stop` thay vì `down`

## Lưu ý quan trọng

### 3 Services chính

| Service      | Vai trò           | Port           | Image                  |
| ------------ | ----------------- | -------------- | ---------------------- |
| **postgres** | Database          | 5432           | postgres:16-alpine     |
| **redis**    | Queue cache       | 6379           | redis:7-alpine         |
| **worker**   | Karaoke processor | N/A (internal) | Custom (Node + Python) |

### Healthchecks

- **PostgreSQL:** Check `pg_isready` mỗi 10s
- **Redis:** Check `redis-cli ping` mỗi 5s
- **Worker:** Depends on Redis + PostgreSQL healthchecks

### Development vs Production

- ⚠️ Cấu hình này chỉ dành cho **development**
- ⚠️ **KHÔNG** dùng mật khẩu mặc định ở trên cho production
- ⚠️ Production nên dùng managed services (AWS RDS, ElastiCache, etc.)

### Security

- Mật khẩu mặc định (`1234abcd` PostgreSQL, từ `.env` Redis) chỉ dùng cho local development
- Không expose ports 5432/6379 ra internet
- Không commit `.env` với credentials vào Git

### Performance

- Docker trên macOS có thể chậm hơn native services
- Nếu cần performance tốt hơn, cân nhắc cài native (PostgreSQL, Redis)
- Volume mount tối ưu cho development, chưa optimize cho production

### Data Persistence

- PostgreSQL data lưu trong Docker volume `postgres_data`
- Volume tồn tại ngay cả khi container bị xóa
- Chỉ mất data khi chạy `docker-compose down -v` hoặc xóa volume thủ công
- Redis là in-memory, data mất khi restart (ngoài RDB persistence)

## Tóm tắt Commands

```bash
# === Khởi động ===
docker-compose up -d                # Tất cả services
docker-compose up -d postgres redis  # Chỉ DB + Queue
docker-compose up -d --build worker  # Rebuild worker

# === Quản lý ===
docker-compose ps                   # Xem status
docker-compose logs -f              # Xem logs realtime
docker-compose logs -f worker       # Xem logs worker

# === Kết nối ===
docker-compose exec postgres psql -U kwong2000 -d krok  # PostgreSQL CLI
docker-compose exec redis redis-cli -a password          # Redis CLI

# === Dừng ===
docker-compose stop                 # Dừng (giữ data)
docker-compose down                 # Dừng + xóa containers
docker-compose down -v              # Dừng + xóa data (**careful!**)

# === Restart ===
docker-compose restart              # Restart tất cả
docker-compose restart worker       # Restart worker

# === Backup ===
docker-compose exec postgres pg_dump -U kwong2000 krok > backup.sql
docker-compose exec -T postgres psql -U kwong2000 krok < backup.sql
```

---

## Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [PostgreSQL Docker Image](https://hub.docker.com/_/postgres)
- [Redis Docker Image](https://hub.docker.com/_/redis)
- [Environment Variables Guide](./environment-variables.md)

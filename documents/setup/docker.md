# Hướng dẫn sử dụng Docker cho Database

Tài liệu này hướng dẫn cách sử dụng Docker để chạy PostgreSQL database cho dự án mimkat-api.

## Tại sao nên dùng Docker?

- ✅ Không cần cài đặt PostgreSQL trực tiếp trên máy
- ✅ Dễ dàng khởi động và dừng database
- ✅ Cấu hình nhất quán giữa các môi trường
- ✅ Dễ dàng xóa và tạo lại database
- ✅ Không ảnh hưởng đến các PostgreSQL instance khác trên máy

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

File `docker-compose.yml` đã được tạo sẵn trong thư mục gốc của dự án với cấu hình:

```yaml
version: '3.8'

services:
  postgres:
    ports:
      - '5432:5432'
    restart: unless-stopped
    image: postgres:16-alpine
    container_name: mimkat-postgres
    environment:
      POSTGRES_DB: mimkat
      POSTGRES_USER: kwong2000
      POSTGRES_PASSWORD: 1234abcd
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      retries: 5
      timeout: 5s
      interval: 10s
      test: ['CMD-SHELL', 'pg_isready -U postgres']

volumes:
  postgres_data:
    driver: local
```

### Thông tin kết nối

Khi sử dụng Docker, database sẽ có thông tin kết nối:

- **Port**: `5432`
- **Host**: `localhost`
- **Database**: `mimkat`
- **Password**: `1234abcd`
- **Username**: `kwong2000`

**Connection String cho .env:**

```env
DATABASE_URL="postgresql://kwong2000:1234abcd@localhost:5432/mimkat"
```

## Sử dụng

### 1. Khởi động database

```bash
docker-compose up -d
```

- Flag `-d` để chạy ở chế độ background (detached)
- Lần đầu tiên sẽ mất vài giây để tải PostgreSQL image

### 2. Kiểm tra trạng thái

```bash
# Xem các container đang chạy
docker-compose ps

# Hoặc
docker ps
```

Bạn sẽ thấy container `mimkat-postgres` đang chạy.

### 3. Xem logs

```bash
# Xem logs realtime
docker-compose logs -f postgres

# Chỉ xem logs (không follow)
docker-compose logs postgres
```

### 4. Dừng database

```bash
# Dừng nhưng giữ lại data
docker-compose stop

# Dừng và xóa container (data vẫn được giữ trong volume)
docker-compose down
```

### 5. Khởi động lại

```bash
# Nếu đã stop
docker-compose start

# Hoặc dùng up lại
docker-compose up -d
```

## Các lệnh hữu ích

### Kết nối vào PostgreSQL CLI

```bash
# Từ docker-compose
docker-compose exec postgres psql -U kwong2000 -d mimkat

# Hoặc từ docker
docker exec -it mimkat-postgres psql -U kwong2000 -d mimkat
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

### Xóa tất cả data và khởi động lại

```bash
# Dừng và xóa containers + volumes
docker-compose down -v

# Khởi động lại
docker-compose up -d

# Chạy lại migrations
npm run prisma:migrate
```

### Backup database

```bash
# Export database ra file
docker-compose exec postgres pg_dump -U kwong2000 mimkat > backup.sql

# Hoặc với timestamp
docker-compose exec postgres pg_dump -U kwong2000 mimkat > backup-$(date +%Y%m%d-%H%M%S).sql
```

### Restore database từ backup

```bash
# Import từ file backup
docker-compose exec -T postgres psql -U kwong2000 mimkat < backup.sql
```

### Thay đổi mật khẩu

Nếu muốn thay đổi mật khẩu, sửa trong `docker-compose.yml`:

```yaml
environment:
  POSTGRES_PASSWORD: your-new-password
```

Sau đó:

```bash
docker-compose down -v
docker-compose up -d
```

Và cập nhật `DATABASE_URL` trong `.env`:

## Troubleshooting

### Port 5432 đã được sử dụng

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
ports:
  - '5433:5432' # Đổi từ 5432 thành 5433
```

Và cập nhật `DATABASE_URL`:

```env
DATABASE_URL="postgresql://kwong2000:1234abcd@localhost:5433/mimkat"
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

# Test connection
docker-compose exec postgres pg_isready -U kwong2000
```

### Data bị mất sau khi restart

**Nguyên nhân:** Chạy `docker-compose down -v` sẽ xóa volumes

**Giải pháp:**

- Chỉ dùng `docker-compose down` (không có flag `-v`)
- Hoặc dùng `docker-compose stop` thay vì `down`

## Lưu ý quan trọng

### Development vs Production

- ⚠️ Cấu hình này chỉ dành cho **development**
- ⚠️ **KHÔNG** dùng mật khẩu `postgres` cho production
- ⚠️ Production nên dùng managed database (AWS RDS, Google Cloud SQL, etc.)

### Security

- Mật khẩu mặc định `1234abcd` chỉ dùng cho local development
- Không expose port 5432 ra internet
- Không commit `.env` với credentials vào Git

### Performance

- Docker trên macOS có thể chậm hơn native PostgreSQL
- Nếu cần performance tốt hơn, cân nhắc cài PostgreSQL native
- Volume mount được tối ưu cho development, chưa optimize cho production

### Data Persistence

- Data được lưu trong Docker volume `postgres_data`
- Volume tồn tại ngay cả khi container bị xóa
- Chỉ mất data khi chạy `docker-compose down -v` hoặc xóa volume thủ công

## Tóm tắt Commands

```bash
# Khởi động
docker-compose up -d

# Dừng (giữ data)
docker-compose stop

# Dừng và xóa container (giữ data)
docker-compose down

# Xóa tất cả (bao gồm data)
docker-compose down -v

# Xem logs
docker-compose logs -f postgres

# Kiểm tra status
docker-compose ps

# Kết nối PostgreSQL CLI
docker-compose exec postgres psql -U kwong2000 -d mimkat

# Backup
docker-compose exec postgres pg_dump -U kwong2000 mimkat > backup.sql

# Restore
docker-compose exec -T postgres psql -U kwong2000 mimkat < backup.sql
```

---

## Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [PostgreSQL Docker Image](https://hub.docker.com/_/postgres)
- [pgAdmin Docker Image](https://hub.docker.com/r/dpage/pgadmin4/)

# Scheduled Cleanup Tasks

Tài liệu này mô tả chi tiết các cron job được triển khai trong file `src/tasks/cleanup.service.ts` của dự án Mimkat API. Các tác vụ này giúp tự động dọn dẹp dữ liệu cũ, không còn giá trị, nhằm đảm bảo hệ thống luôn sạch sẽ, bảo mật và tối ưu hiệu năng.

## 1. cleanupUnverifiedAccounts

**Schedule:** Mỗi ngày lúc 2:00 sáng

**Purpose:**

- Xóa các tài khoản người dùng chưa xác thực email (`isEmailVerified: false`) và đã được tạo cách đây hơn 14 ngày.
- Giúp loại bỏ các tài khoản "rác" hoặc bị bỏ quên, tránh chiếm dụng tài nguyên hệ thống.

**Operation Logic:**

- Tính ngày hiện tại trừ đi 14 ngày để lấy mốc thời gian.
- Xóa tất cả user có `isEmailVerified: false` và `createdAt < mốc thời gian này`.
- Ghi log số lượng tài khoản đã xóa để tiện theo dõi.

**Related Fields:**

- `isEmailVerified`: trạng thái xác thực email của user.
- `createdAt`: thời điểm tạo tài khoản.

## 2. cleanupExpiredTokens

**Schedule:** Mỗi ngày lúc 3:00 sáng

**Purpose:**

- Xóa các token xác thực email và token đặt lại mật khẩu đã hết hạn, giúp tăng bảo mật và giảm dữ liệu không cần thiết.

**Operation Logic:**

1. Dọn dẹp token xác thực email:
   - Tìm các user chưa xác thực email (`isEmailVerified: false`) và có `verificationTokenExpiry < thời điểm hiện tại`.
   - Đặt lại giá trị `verificationToken` và `verificationTokenExpiry` về `null`.
2. Dọn dẹp token đặt lại mật khẩu:
   - Tìm các user có `passwordResetTokenExpiry < thời điểm hiện tại`.
   - Đặt lại giá trị `passwordResetToken` và `passwordResetTokenExpiry` về `null`.

- Ghi log số lượng token đã được dọn dẹp.

**Related Fields:**

- `verificationToken`, `verificationTokenExpiry`: token và thời hạn xác thực email.
- `passwordResetToken`, `passwordResetTokenExpiry`: token và thời hạn đặt lại mật khẩu.

## 3. cleanupExpiredSessions

**Schedule:** Mỗi giờ

**Purpose:**

- Xóa các phiên đăng nhập (session) đã hết hạn, giúp giải phóng tài nguyên và đảm bảo tính toàn vẹn của hệ thống đăng nhập.

**Operation Logic:**

- Tìm các session có `expiresAt < thời điểm hiện tại`.
- Xóa các session này khỏi database.
- Ghi log số lượng session đã xóa.

**Related Fields:**

- `expiresAt`: thời điểm hết hạn của session.

**General Notes:**

- Các cron job sử dụng Prisma ORM để thao tác với cơ sở dữ liệu.
- Mỗi lần thực hiện đều ghi log để tiện giám sát và debug khi cần thiết.
- Thời gian chạy các job được thiết lập hợp lý để không ảnh hưởng đến hiệu năng hệ thống.

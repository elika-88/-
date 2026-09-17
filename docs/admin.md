# 管理后台与数据库

`/admin` 集中管理默认 API Base URL、API key、模型及接口类型。设置保存后新生成请求立即使用，无需重启。普通用户的显式自定义配置仍只作用于该次请求。

## 初始化

### Vercel 部署

Vercel 无持久化本地磁盘。请在 Turso 创建数据库，将以下变量添加到 Vercel 项目的 **Production** 环境后重新部署：`TURSO_DATABASE_URL`、`TURSO_AUTH_TOKEN`、`ADMIN_PASSWORD`、`ADMIN_ENCRYPTION_KEY`。其中管理员密码至少6位，加密密钥必须是64位十六进制。再配置 `OPENAI_BASE_URL`、`OPENAI_API_KEY`、`OPENAI_MODEL` 和 `OPENAI_API_FORMAT`。访问 `/api/admin/status` 应返回 HTTP 200；返回 `configured:false` 时响应中的 `setupError` 会指出缺少哪类配置。

首次访问 `/admin` 不再调用受保护的 `/api/admin`，而是调用公开的状态接口；未登录的 `/api/admin` 返回401仍是刻意的鉴权行为，不是服务故障。

自定义管理员密码至少8位。初始化默认生成32位随机密码；已有密码或加密密钥不会被重置。配置缺失与格式错误会显示不同提示。

运行 `npm run admin:setup`。脚本在本机 `.env.local` 中创建随机 `ADMIN_PASSWORD` 和独立的64位十六进制 `ADMIN_ENCRYPTION_KEY`，已有值不会被覆盖。管理员在本机读取密码，重启服务后登录。不要提交或分享这个文件。

第一次登录可看到环境中的地址、模型和密钥是否存在。密钥留空表示沿用；改变API地址必须重新输入密钥，避免将旧凭据发往新地址。保存只验证格式，不保证服务连通和模型可用。

## SQLite

数据库首次访问时自动初始化，默认 `.data/admin.sqlite`，可通过 `ADMIN_DATABASE_PATH` 指定持久化磁盘路径。表：settings（AES-256-GCM加密配置）、sessions（令牌哈希、有效期及密码版本）、audit（不含秘密的事件）、login_limit（登录尝试限制）。

保存使用事务和版本号，防止两个管理员互相覆盖。会话有效8小时，HttpOnly、SameSite=Strict；HTTPS访问时Secure。退出会撤销令牌，修改密码会使已有会话失效。连续10次密码错误后等待5分钟。后台写操作校验同源请求。

数据库和加密密钥应分别备份；丢失密钥无法解密配置。数据库文件、真实凭据均被Git忽略。`.env.local`中的旧API配置只是未保存时的回退值。后台保存后数据库优先。

该实现适合单机或挂载持久化磁盘的Node服务。**不适合直接用本地SQLite作为多实例或无持久化磁盘的Serverless配置存储**；这种部署应改用托管数据库。SQLite是Node 22的实验模块，升级运行时需复测。

数据库当前保存管理配置和会话，不集中收集学生讲稿；学生学习历史继续保存在本人浏览器。管理员密码与加密根密钥必须保留在数据库之外，不能只放进自身加密的数据库。

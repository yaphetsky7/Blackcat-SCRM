# Ubuntu / Linode 后台部署

Windows 客户端继续在客户电脑运行。这里只迁移登录、配套、AI 点数、Claude 中转和更新下载后台。
需要 Node.js 24 LTS（含 node:sqlite）、Python 3、Caddy 和持久磁盘。

## 目录

- /opt/blackcat-node/：从 Node.js 官方下载、核对 SHA256 的运行时。
- /opt/blackcat-server/releases/版本或提交/server/：本仓库 server/ 源码。
- /opt/blackcat-server/current：当前运行源码目录的符号链接。
- /var/lib/blackcat-server/blackcat.db：客户、配套、点数与会话数据库。
- /var/lib/blackcat-server/updates/：已发布安装包和发布信息。
- /var/lib/blackcat-server/dist/：待发布安装包，只放本次要发布的版本。
- /etc/blackcat-server/claude.env：ANTHROPIC_API_KEY 配置，仅 root 可读，权限 0600。不要提交到 Git。
- /var/backups/blackcat-server/：每小时一致性数据库快照，保留 14 天。这些仍在同一服务器，并非异地备份。

## 服务

1. 创建无登录权限的 blackcat 系统用户，数据目录归该用户所有。
2. 把 blackcat-server.service 放到 /etc/systemd/system/，校对源码、运行时和数据路径。
3. 将 Caddyfile.example 的域名换成服务器真实域名，并保存到 /etc/caddy/Caddyfile。公网开放 TCP 80、443；SSH 22 仅限管理来源。
4. 启用 blackcat-server 和 caddy 服务。
5. 启用 blackcat-backup.service 和 blackcat-backup.timer，执行一次备份检查。
6. 检查 HTTPS 后台的 /health、/admin/ 和 /updates/latest.yml。

后台绑定 127.0.0.1:8787，由 Caddy 提供 HTTPS。Claude Key 未配置前，账号服务可以启动，点数 AI 会明确返回未配置错误。
不要将根目录、数据库目录或配置目录作为公开静态文件目录。

## 从 Windows 迁移

先保留旧后台和源文件。通过 SQLite Backup API 导出一致性快照，不要只复制仍在写入的 .db 而漏掉 WAL。
核对完整性、表记录数量和点数合计后，再传入新数据目录，并重新配置 Claude API Key。
测试新后台期间仍可能有旧后台写入；最终切换需要一次短暂维护窗口，重新做最终快照。
核对客户登录、余额、AI 收费和更新下载后再切换客户地址，避免两个后台各自扣点。
旧 *.ts.net 地址绑定原 Tailscale 设备，不能直接当成新服务器的 DNS 地址；必须安排旧客户端的迁移或过渡入口。

## Windows 打包后发布

将这次安装包上传到服务器的 dist/，核对 SHA512，设置所有权后，在服务器上运行：

    sudo -u blackcat env DATA_DIR=/var/lib/blackcat-server DIST_DIR=/var/lib/blackcat-server/dist \
      /opt/blackcat-node/bin/node /opt/blackcat-server/current/server/scripts/publish-update.js

发布器会选择 dist/ 内最高版本，只应放本次待发布的安装包。已发布版本不能直接用更低版本覆盖。
此步骤只发布云服务器的更新；原来 Windows 的本地发布脚本不会自动上传到云端。

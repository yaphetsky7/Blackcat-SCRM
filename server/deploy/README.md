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

Claude Key 由管理员在自己的交互终端输入：先将 configure-claude.sh 安装为 /usr/local/sbin/blackcat-configure-claude（root 所有、0750），再手动运行。
输入不会回显；脚本不会把 Key 放进命令行、聊天或日志，只会写入服务器上的 0600 配置文件。

## 从 Windows 迁移

先保留旧后台和源文件。通过 SQLite Backup API 导出一致性快照，不要只复制仍在写入的 .db 而漏掉 WAL。
核对完整性、表记录数量和点数合计后，再传入新数据目录，并重新配置 Claude API Key。
测试新后台期间仍可能有旧后台写入；最终切换需要一次短暂维护窗口，重新做最终快照。
核对客户登录、余额、AI 收费和更新下载后再切换客户地址，避免两个后台各自扣点。
旧 *.ts.net 地址绑定原 Tailscale 设备，不能直接当成新服务器的 DNS 地址；必须安排旧客户端的迁移或过渡入口。

旧 Windows 入口可建立 server/cloud-origin.json，仅包含 origin（新后台 HTTPS 地址）。
存在该文件时，npm start 和 start-with-key.ps1 使用 cloud-forwarder.cjs 转接到云端，不再提供本地账号或扣点服务。
此文件不提交 Git，也不复制到云服务器。旧地址仍依赖旧 Windows 电脑及 Tailscale；已更新到新地址的客户端直接连接云端。
使用新的安装包可自动把原默认 *.ts.net 地址迁到新默认地址，用户自设的其他服务器地址会保留。

## Windows 打包后发布

将这次安装包上传到服务器的 dist/，核对 SHA512，设置所有权后，在服务器上运行：

    sudo -u blackcat env DATA_DIR=/var/lib/blackcat-server DIST_DIR=/var/lib/blackcat-server/dist \
      /opt/blackcat-node/bin/node /opt/blackcat-server/current/server/scripts/publish-update.js

发布器会选择 dist/ 内最高版本，只应放本次待发布的安装包。已发布版本不能直接用更低版本覆盖。
此步骤只发布云服务器的更新；原来 Windows 的本地发布脚本不会自动上传到云端。

Windows 一键发布：将 local.example.json 复制为项目根目录的 .blackcat-deploy.json，填写 SSH 目标和密钥路径。
该文件已被 Git 忽略，不填写密钥内容或 Claude Key。正常运行原来的推送更新.bat，就会使用云端上传流程。
也可以先打包，再单独运行 node scripts/publish-cloud-update.cjs，BC_NOTES、BC_FORCED 环境变量的用法保持一致。
流程上传当前版本的唯一安装包，验证 SHA512，然后在云端发布；安装包不会与 dist 目录里误写的旧版本混用。

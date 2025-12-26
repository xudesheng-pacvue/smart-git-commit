# Smart Git Commit - VSCode 扩展

一个智能的 Git Commit 助手，支持 Jira 集成和 Smart Commits 功能。

> 本项目基于 [Emoji-Log-VSCode](https://github.com/ahmadawais/Emoji-Log-VSCode) 项目改版开发，原项目由 Ahmad Awais 创建并采用 MIT 许可证。  
> 感谢原作者的贡献！本项目同样采用 MIT 开源协议。

## 版本信息

**当前版本:** 2.0.0

### 版本更新说明

#### v2.0.0 (重大更新)
- **破坏性变更:** 移除了表情符号提交功能
- **新增:** 完全重构的智能提交系统
- **新增:** Jira 集成和 Smart Commits 支持
- **新增:** 自动分支名称解析
- **新增:** 状态转换和工时跟踪
- **改进:** 使用 `/` 触发器代替手动点击图标

## 功能特性

### 1. 智能提交模板
- 输入 `/` 自动触发提交模板选择
- 支持多种提交类型：feat, fix, docs, style, refactor, perf, test, chore 等
- 无需表情符号，使用标准的 Conventional Commits 格式

### 2. Jira 集成
- 自动识别 Jira 分支名称（如 `CON-1`, `WOR-241-5`）
- 自动提取正确的 Jira Issue Key
- 获取 Issue 详细信息和当前状态
- 显示可用的状态转换

### 3. Smart Commits 支持
- 自动生成符合 Jira Smart Commits 规范的提交消息
- 支持 `#comment` 命令添加评论
- 支持 `#transition` 命令更改状态
- 支持 `#time` 命令记录工时

### 4. 智能工时计算
- 自动获取 Issue 剩余时间
- 智能格式化时间（如 `1h`, `2h 30m`）
- 默认建议合理的工时

## 安装

1. 在 VSCode 扩展市场搜索 "智能 Git Commit"
2. 点击安装
3. 重新加载 VSCode

## 配置

### Jira 配置

在使用 Jira 集成功能前，需要配置以下信息：

1. 打开 VSCode 设置（`Ctrl/Cmd + ,`）
2. 搜索 "Smart Commit"
3. 配置以下选项：
   - **Jira API URL**: 你的 Jira 实例地址（如 `https://your-domain.atlassian.net`）
   - **Jira Email**: 你的 Jira 账号邮箱
   - **Jira API Token**: 你的 Jira API Token

#### 获取 Jira API Token

1. 访问 [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. 点击 "Create API token"
3. 输入标签名称（如 "VSCode Extension"）
4. 复制生成的 Token
5. 在 VSCode 设置中粘贴该 Token

### 快速配置命令

也可以使用命令面板快速配置：

1. 按 `Ctrl/Cmd + Shift + P` 打开命令面板
2. 输入 "Smart Commit: Configure Jira"
3. 按照提示输入配置信息

## 使用方法

### 基础使用

1. 在 Git 提交输入框中输入 `/`
2. 自动弹出提交模板选择菜单
3. 选择合适的模板
4. 填写提交描述

### Jira 分支使用

当你在 Jira 分支上工作时（如 `CON-123` 或 `WOR-241-5`）：

1. 输入 `/` 触发模板
2. 扩展会自动识别 Jira Issue Key
3. 显示 Issue 信息和可用的状态转换
4. 选择带状态转换的模板会自动生成完整的 Smart Commit

### 提交格式示例

#### 简单提交
```
feat: CON-123 #comment 添加用户导出功能
```

#### 带状态转换的提交
```
feat: CON-123 #comment 添加用户导出功能 CON-123 #done #time 2h
```

#### 复杂提交
```
feat: WOR-241 #comment 实现 CSV 导出功能

添加了新的 ExportService 和相应的单元测试

WOR-241 #in-progress #time 3h 30m
```

## Jira 分支名称规则

扩展支持以下 Jira 分支命名格式：

- `CON-1` - 标准格式
- `CON-1-2` - 带版本号（提取为 `CON-1`）
- `WOR-241` - 标准格式
- `WOR-241-5` - 带版本号（提取为 `WOR-241`）
- `feature/CON-123` - 带前缀
- `bugfix/WOR-456-2` - 带前缀和版本号

**注意:** 对于 `WOR-241-5` 这样的分支，扩展会自动识别真正的 Issue Key 是 `WOR-241`，而不是 `WOR-241-5`。

## Smart Commits 命令

根据 Jira Smart Commits 规范，支持以下命令：

### #comment
添加评论到 Issue
```
CON-123 #comment 这是一条评论
```

### #time
记录工时
```
CON-123 #time 1w 2d 4h 30m 完成的工作描述
```

支持的时间单位：
- `w` - 周
- `d` - 天
- `h` - 小时
- `m` - 分钟

### #transition
更改 Issue 状态
```
CON-123 #done #comment 已完成
CON-123 #in-progress #time 2h
```

**注意:** 
- 状态转换名称会自动转换为小写并用连字符连接
- 例如 "Start Progress" 会变成 `#start-progress`
- 如果只有一个单词，可以简写（如 `#done`）

## 提交类型说明

| 类型 | 描述 | Jira 支持 |
|------|------|-----------|
| feat | 新功能 | ✅ |
| fix | 修复 Bug | ✅ |
| docs | 文档更新 | ✅ |
| style | 代码格式修改（不影响功能） | ✅ |
| refactor | 代码重构 | ✅ |
| perf | 性能优化 | ✅ |
| test | 增加或修改测试 | ✅ |
| chore | 构建过程或辅助工具的变动 | ✅ |
| build | 构建系统或外部依赖的更改 | ✅ |
| ci | CI配置文件和脚本的更改 | ✅ |
| revert | 回退之前的提交 | ✅ |
| merge | 合并分支 | ❌ |

## 故障排查

### 无法获取 Jira 信息

1. 检查 Jira API URL 是否正确
2. 确认 API Token 是否有效
3. 检查网络连接
4. 查看 VSCode 开发者工具的控制台错误信息

### 模板不显示

1. 确保在 Git 仓库中
2. 检查是否正确输入了 `/`
3. 尝试重新加载 VSCode 窗口

### 分支名称识别错误

1. 确保分支名称符合 Jira 命名规范（大写字母-数字）
2. 检查分支名称格式是否正确

## 依赖项

- **axios**: ^1.6.0 - 用于 Jira API 调用

## 开发

### 构建项目

```bash
npm install
npm run compile
```

### 调试

1. 在 VSCode 中打开项目
2. 按 F5 启动调试
3. 在新窗口中测试扩展

### 打包

```bash
npm run build
```

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT - 详见 [LICENSE](./LICENSE) 文件

## 致谢

本项目基于 [Emoji-Log-VSCode](https://github.com/ahmadawais/Emoji-Log-VSCode) 项目进行改版和扩展开发。

- **原项目作者**: Ahmad Awais ([@MrAhmadAwais](https://twitter.com/MrAhmadAwais))
- **原项目许可证**: MIT
- **原项目地址**: https://github.com/ahmadawais/Emoji-Log-VSCode

感谢 Ahmad Awais 创建了优秀的基础框架，使得本项目的开发成为可能。

## 贡献者

- **Ruomu Xu** - 主要开发者和维护者

## 更新日志

### 2.0.0
- 完全重构插件架构
- 移除表情符号功能
- 添加 Jira 集成
- 添加 Smart Commits 支持
- 使用 `/` 触发器
- 自动分支名称识别
- 状态转换建议
- 工时跟踪

### 1.3.3
- 原始表情符号提交功能

## 相关链接

- [Jira Smart Commits 文档](https://support.atlassian.com/jira-software-cloud/docs/process-issues-with-smart-commits/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens)


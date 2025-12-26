import * as vscode from 'vscode';
import CommitTemplates, { CommitTemplate } from '../templates/CommitTemplates';
import { JiraService, JiraTransition } from '../services/JiraService';
import { Repository } from '../api/git';

/**
 * Git Commit 消息补全提供者
 */
export class CommitCompletionProvider implements vscode.CompletionItemProvider {
	private jiraService: JiraService;
	private repository: Repository | undefined;

	constructor(jiraService: JiraService) {
		this.jiraService = jiraService;
	}

	/**
	 * 设置当前仓库
	 */
	public setRepository(repository: Repository | undefined): void {
		this.repository = repository;
	}

	/**
	 * 提供补全项
	 */
	async provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken,
		context: vscode.CompletionContext
	): Promise<vscode.CompletionItem[] | vscode.CompletionList | undefined> {
		const linePrefix = document.lineAt(position).text.substr(0, position.character);
		
		// 只在输入 "/" 时触发
		if (!linePrefix.endsWith('/')) {
			return undefined;
		}

		// 获取当前分支名称
		const branchName = this.repository?.state.HEAD?.name;
		const jiraKey = branchName ? this.jiraService.extractJiraKeyFromBranch(branchName) : null;

		const completionItems: vscode.CompletionItem[] = [];

		// 如果是 Jira 分支并且配置了 Jira
		if (jiraKey && this.jiraService.isConfigured()) {
			// 获取 Jira Issue 信息
			try {
				const issue = await this.jiraService.getIssue(jiraKey);
				const transitions = await this.jiraService.getTransitions(jiraKey);

				if (issue) {
					// 为每个提交类型创建补全项
					for (const template of CommitTemplates) {
						if (template.hasJiraSupport) {
							const items = await this.createJiraCompletionItems(
								template,
								jiraKey,
								issue,
								transitions
							);
							completionItems.push(...items);
						}
					}
				}
			} catch (error) {
				console.error('获取 Jira 信息失败:', error);
				// 如果失败，提供基础模板
				this.addBasicTemplates(completionItems, jiraKey);
			}
		} else if (jiraKey) {
			// 有 Jira 分支但未配置
			this.addBasicTemplates(completionItems, jiraKey);
		} else {
			// 非 Jira 分支，提供基础模板
			this.addBasicTemplates(completionItems, null);
		}

		return completionItems;
	}

	/**
	 * 创建带 Jira 集成的补全项
	 */
	private async createJiraCompletionItems(
		template: CommitTemplate,
		jiraKey: string,
		issue: any,
		transitions: JiraTransition[]
	): Promise<vscode.CompletionItem[]> {
		const items: vscode.CompletionItem[] = [];

		// 基础格式: type: JIRA-KEY #comment 内容
		const basicItem = new vscode.CompletionItem(
			`${template.type}: ${jiraKey}`,
			vscode.CompletionItemKind.Snippet
		);
		basicItem.detail = `${template.description} - ${issue.fields.summary}`;
		basicItem.insertText = new vscode.SnippetString(
			`${template.type}: ${jiraKey} #comment \${1:描述内容}`
		);
		basicItem.documentation = new vscode.MarkdownString(
			`**提交类型:** ${template.type}\n\n**描述:** ${template.description}\n\n**Jira Issue:** ${jiraKey}\n\n**标题:** ${issue.fields.summary}\n\n**当前状态:** ${issue.fields.status.name}`
		);
		basicItem.sortText = `0_${template.type}`;
		items.push(basicItem);

		// 为每个可用的状态转换创建补全项
		for (const transition of transitions) {
			const transitionName = this.formatTransitionName(transition.name);
			const timeEstimate = this.jiraService.formatTimeTracking(
				issue.fields.timetracking?.remainingEstimateSeconds
			);

			const transitionItem = new vscode.CompletionItem(
				`${template.type}: ${jiraKey} → ${transition.to.name}`,
				vscode.CompletionItemKind.Snippet
			);
			transitionItem.detail = `${template.description} - 转换到 ${transition.to.name}`;
			
			// 生成完整的 Smart Commit 格式
			// 格式: type: PARENT-KEY #comment 内容 SUB-KEY #transition #time 1h
			const snippetText = `${template.type}: ${jiraKey} #comment \${1:描述内容} ${jiraKey} #${transitionName} #time ${timeEstimate}`;
			
			transitionItem.insertText = new vscode.SnippetString(snippetText);
			transitionItem.documentation = new vscode.MarkdownString(
				`**提交类型:** ${template.type}\n\n` +
				`**Jira Issue:** ${jiraKey}\n\n` +
				`**当前状态:** ${issue.fields.status.name}\n\n` +
				`**转换到:** ${transition.to.name}\n\n` +
				`**预估时间:** ${timeEstimate}\n\n` +
				`**格式说明:**\n` +
				`\`\`\`\n` +
				`${template.type}: ${jiraKey} #comment 描述内容\n` +
				`${jiraKey} #${transitionName} #time ${timeEstimate}\n` +
				`\`\`\``
			);
			transitionItem.sortText = `1_${template.type}_${transition.name}`;
			items.push(transitionItem);
		}

		return items;
	}

	/**
	 * 添加基础模板(不带 Jira 集成)
	 */
	private addBasicTemplates(items: vscode.CompletionItem[], jiraKey: string | null): void {
		for (const template of CommitTemplates) {
			const item = new vscode.CompletionItem(
				template.type,
				vscode.CompletionItemKind.Snippet
			);
			item.detail = template.description;
			
			if (jiraKey) {
				item.insertText = new vscode.SnippetString(
					`${template.type}: ${jiraKey} \${1:描述内容}`
				);
			} else {
				item.insertText = new vscode.SnippetString(
					`${template.type}: \${1:描述内容}`
				);
			}
			
			item.documentation = new vscode.MarkdownString(
				`**类型:** ${template.type}\n\n**描述:** ${template.description}`
			);
			item.sortText = `0_${template.type}`;
			items.push(item);
		}
	}

	/**
	 * 格式化转换名称，用于 Smart Commit 命令
	 * 例如: "Start Progress" -> "start-progress"
	 */
	private formatTransitionName(name: string): string {
		return name.toLowerCase().replace(/\s+/g, '-');
	}
}


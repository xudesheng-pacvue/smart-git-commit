import * as vscode from 'vscode';
import { GitExtension, Repository } from './api/git';
import { JiraService } from './services/JiraService';
import { CommitCompletionProvider } from './providers/CommitCompletionProvider';

let jiraService: JiraService;
let completionProvider: CommitCompletionProvider;

export function activate(context: vscode.ExtensionContext) {
	console.log('智能 Git Commit 扩展已激活');

	// 初始化服务
	jiraService = new JiraService();
	completionProvider = new CommitCompletionProvider(jiraService);

	// 检查是否是首次使用
	checkFirstTimeUse(context);

	// 获取 Git 扩展
	const git = getGitExtension();
	if (!git) {
		vscode.window.showErrorMessage('无法加载 Git 扩展');
		return;
	}

	// 监听 Git 仓库变化
	setupRepositoryListener(git);

	// 自定义 SCM Input 补全
	const scmDisposables = setupSCMInputCompletion(git);

	// 监听配置变化
	const configDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
		if (e.affectsConfiguration('smartCommit.jira')) {
			jiraService.reloadConfig();
			vscode.window.showInformationMessage('Jira 配置已更新');
		}
	});

	// 注册配置命令
	const configCommand = vscode.commands.registerCommand('smartCommit.configureJira', async () => {
		const apiUrl = await vscode.window.showInputBox({
			prompt: '请输入 Jira API URL',
			placeHolder: 'https://your-domain.atlassian.net',
			value: vscode.workspace.getConfiguration('smartCommit.jira').get('apiUrl', ''),
		});

		if (apiUrl) {
			await vscode.workspace.getConfiguration('smartCommit.jira').update('apiUrl', apiUrl, true);

			const email = await vscode.window.showInputBox({
				prompt: '请输入 Jira 账号邮箱',
				placeHolder: 'your-email@example.com',
				value: vscode.workspace.getConfiguration('smartCommit.jira').get('email', ''),
			});

			if (email) {
				await vscode.workspace.getConfiguration('smartCommit.jira').update('email', email, true);

				const apiToken = await vscode.window.showInputBox({
					prompt: '请输入 Jira API Token',
					placeHolder: 'your-api-token',
					password: true,
					value: vscode.workspace.getConfiguration('smartCommit.jira').get('apiToken', ''),
				});

				if (apiToken) {
					await vscode.workspace.getConfiguration('smartCommit.jira').update('apiToken', apiToken, true);
					vscode.window.showInformationMessage('Jira 配置已保存');
					jiraService.reloadConfig();
				}
			}
		}
	});

	context.subscriptions.push(...scmDisposables, configDisposable, configCommand);
}

/**
 * 设置仓库监听器
 */
function setupRepositoryListener(git: any): void {
	// 为现有仓库设置监听
	git.repositories.forEach((repo: Repository) => {
		setupRepositoryCompletion(repo);
	});

	// 监听新仓库打开
	git.onDidOpenRepository((repo: Repository) => {
		setupRepositoryCompletion(repo);
	});
}

/**
 * 为指定仓库设置补全
 */
function setupRepositoryCompletion(repository: Repository): void {
	completionProvider.setRepository(repository);
}

/**
 * 设置 SCM Input 的补全功能
 */
function setupSCMInputCompletion(git: any): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];
	
	// 为每个仓库设置监听
	git.repositories.forEach((repo: Repository) => {
		const disposable = setupRepositoryInputListener(repo);
		disposables.push(disposable);
	});

	// 监听新仓库打开
	const repoListener = git.onDidOpenRepository((repo: Repository) => {
		const disposable = setupRepositoryInputListener(repo);
		disposables.push(disposable);
	});
	disposables.push(repoListener);

	return disposables;
}

/**
 * 为单个仓库设置输入监听
 */
function setupRepositoryInputListener(repo: Repository): vscode.Disposable {
	let lastValue = repo.inputBox.value;
	let isProcessing = false;
	
	const checkInterval = setInterval(() => {
		if (isProcessing) {
			return;
		}
		
		const currentValue = repo.inputBox.value;
		if (currentValue !== lastValue) {
			// 检测斜杠 / 或中文顿号 、
			const endsWithTrigger = (currentValue.endsWith('/') && !lastValue.endsWith('/')) ||
			                        (currentValue.endsWith('、') && !lastValue.endsWith('、'));
			
			if (endsWithTrigger) {
				isProcessing = true;
				handleInputChange(repo, currentValue, lastValue).finally(() => {
					isProcessing = false;
				});
			}
			lastValue = currentValue;
		}
	}, 50); // 降低检查频率到 50ms

	return new vscode.Disposable(() => {
		clearInterval(checkInterval);
	});
}

/**
 * 处理输入变化
 */
async function handleInputChange(
	repository: Repository,
	currentValue: string,
	lastValue: string
): Promise<void> {
	// 触发补全
	await showCompletionQuickPick(repository);
}

/**
 * 显示补全快速选择菜单
 */
async function showCompletionQuickPick(repository: Repository): Promise<void> {
	const branchName = repository.state.HEAD?.name;
	const jiraKey = branchName ? jiraService.extractJiraKeyFromBranch(branchName) : null;

	// 创建 QuickPick 实例以支持动态更新
	const quickPick = vscode.window.createQuickPick();
	quickPick.placeholder = '💡 输入关键词快速筛选...';
	quickPick.matchOnDescription = true;
	quickPick.matchOnDetail = true;
	quickPick.busy = true; // 显示加载状态

	// 先显示基础模板
	const basicTemplates = getBasicTemplates(jiraKey);
	
	// 判断是否需要加载 Jira 信息
	const needsJiraLoading = jiraKey && jiraService.isConfigured();
	
	quickPick.items = basicTemplates.map(template => ({
		label: template.label,
		description: template.description,
		detail: needsJiraLoading ? '⏳ 加载 Jira 信息中...' : template.detail,
		insertText: template.insertText,
	} as any));

	quickPick.show();

	// 异步加载 Jira 信息
	if (needsJiraLoading) {
		loadJiraTemplatesAsync(jiraKey, quickPick, basicTemplates);
	} else {
		quickPick.busy = false;
	}

	// 处理选择
	return new Promise((resolve) => {
		quickPick.onDidAccept(() => {
			const selected = quickPick.selectedItems[0] as any;
			if (selected) {
				const currentValue = repository.inputBox.value;
				// 移除最后一个触发字符（/ 或 、）
				const newValue = currentValue.slice(0, -1) + selected.insertText;
				repository.inputBox.value = newValue;
			}
			quickPick.hide();
			resolve();
		});

		quickPick.onDidHide(() => {
			// 如果取消，移除触发字符（/ 或 、）
			if (!quickPick.selectedItems.length) {
				const currentValue = repository.inputBox.value;
				repository.inputBox.value = currentValue.slice(0, -1);
			}
			quickPick.dispose();
			resolve();
		});
	});
}

/**
 * 获取基础模板（不需要 Jira 信息）
 */
function getBasicTemplates(jiraKey: string | null): any[] {
	const CommitTemplates = require('./templates/CommitTemplates').default;
	const templates: any[] = [];

	for (const template of CommitTemplates) {
		if (jiraKey && template.hasJiraSupport) {
			const insertText = `${template.type}: ${jiraKey} #comment `;
			templates.push({
				label: insertText,
				description: '',
				detail: '',
				insertText: insertText,
			});
		} else if (!jiraKey) {
			const insertText = `${template.type}: `;
			templates.push({
				label: insertText,
				description: '',
				detail: '',
				insertText: insertText,
			});
		}
	}

	return templates;
}

/**
 * 查找所有我们想要显示的状态转换（白名单方式）
 * 返回包含 type 字段的转换对象，type 用于判断是否需要工时
 */
function findWantedTransitions(transitions: any[]): Array<any & { type: 'start' | 'done' }> {
	const wantedTransitions: Array<any & { type: 'start' | 'done' }> = [];
	
	// 定义想要的状态类型（检查转换名称和目标状态名称）
	const startKeywords = [
		'start',
		'开始',
		'in progress',
		'进行',
		'进行中',
		'正在进行',
		'working',
		'doing',
		'todo',
		'to do',
		'待办',
		'开发中',
		'dev',
		'development'
	];
	
	const doneKeywords = [
		'done',
		'完成',
		'finish',
		'finished',
		'complete',
		'结束',
		'resolve',
		'resolved',
		'已解决',
		'deploy',
		'deployed',
		'发布',
		'release',
		'released'
	];
	
	// 遍历所有状态，只选择匹配的
	for (const transition of transitions) {
		const lowerTransitionName = transition.name.toLowerCase();
		const lowerToName = transition.to.name.toLowerCase();
		
		// 同时检查转换名称和目标状态名称
		const combinedText = `${lowerTransitionName} ${lowerToName}`;
		
		// 检查是否是开始/进行中状态
		if (startKeywords.some(keyword => combinedText.includes(keyword))) {
			wantedTransitions.push({
				...transition,
				type: 'start'
			});
			continue;
		}
		
		// 检查是否是完成状态（但排除 close/closed，因为它可能是 reject 的结果）
		// 只有当明确包含 done/完成/finish 等词时才算完成
		if (doneKeywords.some(keyword => combinedText.includes(keyword))) {
			wantedTransitions.push({
				...transition,
				type: 'done'
			});
			continue;
		}
	}
	
	return wantedTransitions;
}

/**
 * 异步加载 Jira 模板
 */
async function loadJiraTemplatesAsync(
	jiraKey: string,
	quickPick: vscode.QuickPick<any>,
	basicTemplates: any[]
): Promise<void> {
	try {
		const { issue, transitions } = await jiraService.getIssueWithTransitions(jiraKey);

		if (!issue) {
			// 如果获取 Issue 失败，保留基础模板
			quickPick.items = basicTemplates.map(template => ({
				label: template.label,
				description: '❌ 无法获取 Jira 信息',
				detail: '',
				insertText: template.insertText,
			} as any));
			quickPick.busy = false;
			return;
		}

		const CommitTemplates = require('./templates/CommitTemplates').default;
		const updatedItems: any[] = [];

		// 查找所有我们想要显示的状态（白名单方式）
		const wantedTransitions = findWantedTransitions(transitions);
		const timeEstimate = jiraService.formatTimeTracking(
			issue.fields.timetracking?.remainingEstimateSeconds
		);
		
		// 调试：输出找到的状态
		console.log(`[Smart Commit] 找到的状态转换:`, {
			总数: transitions.length,
			原始状态列表: transitions.map((t: any) => `${t.name} -> ${t.to.name}`),
			匹配的状态数: wantedTransitions.length,
			匹配的状态: wantedTransitions.map((t: any) => ({ 
				transitionName: t.name, 
				toStatus: t.to.name, 
				type: t.type,
				命令: `#${t.name.toLowerCase().replace(/\s+/g, '-')}`
			}))
		});
		
		// 如果没有匹配到任何状态，输出详细信息
		if (wantedTransitions.length === 0) {
			console.warn(`[Smart Commit] 警告: 没有找到匹配的状态！`);
			console.warn(`[Smart Commit] 原始 transitions:`, JSON.stringify(transitions, null, 2));
		}

		// 为每个提交类型创建模板
		for (const template of CommitTemplates) {
			if (!template.hasJiraSupport) {
				continue;
			}

			// 如果找到了想要的状态，只显示这些状态
			if (wantedTransitions.length > 0) {
				for (const transition of wantedTransitions) {
					const transitionName = transition.name.toLowerCase().replace(/\s+/g, '-');
					
					let insertText: string;
					if (transition.type === 'done') {
						// 完成状态需要记录工时
						insertText = `${template.type}: ${jiraKey} #comment ${issue.fields.summary} #${transitionName} #time ${timeEstimate}`;
					} else {
						// 开始/进行中状态不需要工时
						insertText = `${template.type}: ${jiraKey} #comment ${issue.fields.summary} #${transitionName}`;
					}
					
					updatedItems.push({
						label: insertText,
						description: '',
						detail: '',
						insertText: insertText,
					});
				}
			} else {
				// 如果一个想要的状态都没找到，添加基础模板
				const basicInsertText = `${template.type}: ${jiraKey} #comment ${issue.fields.summary}`;
				updatedItems.push({
					label: basicInsertText,
					description: '',
					detail: '',
					insertText: basicInsertText,
				});
			}
		}

		// 更新 QuickPick 项
		if (updatedItems.length > 0) {
			quickPick.items = updatedItems.slice(0, 20); // 限制最多20项
		} else {
			// 如果没有生成任何项，保留基础模板
			quickPick.items = basicTemplates;
		}
		quickPick.busy = false;
	} catch (error) {
		console.error('加载 Jira 信息失败:', error);
		// 发生错误时，保留基础模板并显示错误提示
		quickPick.items = basicTemplates.map(template => ({
			label: template.label,
			description: '❌ 加载失败',
			detail: '',
			insertText: template.insertText,
		} as any));
		quickPick.busy = false;
	}
}

/**
 * 获取补全模板（已弃用，保留用于兼容）
 */
async function getCompletionTemplates(jiraKey: string | null): Promise<any[]> {
	const CommitTemplates = (await import('./templates/CommitTemplates')).default;
	const templates: any[] = [];

	if (jiraKey && jiraService.isConfigured()) {
		// 获取 Jira 信息
		try {
			const issue = await jiraService.getIssue(jiraKey);
			const transitions = await jiraService.getTransitions(jiraKey);

			if (issue) {
				// 为每个提交类型创建模板
				for (const template of CommitTemplates) {
					if (template.hasJiraSupport) {
						// 基础模板
						templates.push({
							label: `${template.type}: ${jiraKey}`,
							description: template.description,
							detail: issue.fields.summary,
							insertText: `${template.type}: ${jiraKey} #comment `,
						});

						// 状态转换模板
						for (const transition of transitions) {
							const transitionName = transition.name.toLowerCase().replace(/\s+/g, '-');
							const timeEstimate = jiraService.formatTimeTracking(
								issue.fields.timetracking?.remainingEstimateSeconds
							);

							templates.push({
								label: `${template.type}: ${jiraKey} → ${transition.to.name}`,
								description: `${template.description} - 转换到 ${transition.to.name}`,
								detail: `${issue.fields.summary} (${timeEstimate})`,
								insertText: `${template.type}: ${jiraKey} #comment  ${jiraKey} #${transitionName} #time ${timeEstimate}`,
							});
						}
					}
				}
			}
		} catch (error) {
			console.error('获取 Jira 信息失败:', error);
			// 失败时使用基础模板
			addBasicTemplates(templates, CommitTemplates, jiraKey);
		}
	} else if (jiraKey) {
		// 有 Jira 分支但未配置
		addBasicTemplates(templates, CommitTemplates, jiraKey);
	} else {
		// 非 Jira 分支
		addBasicTemplates(templates, CommitTemplates, null);
	}

	return templates;
}

/**
 * 添加基础模板
 */
function addBasicTemplates(templates: any[], CommitTemplates: any[], jiraKey: string | null): void {
	for (const template of CommitTemplates) {
		templates.push({
			label: template.type,
			description: template.description,
			detail: jiraKey ? `使用 ${jiraKey}` : '基础提交模板',
			insertText: jiraKey ? `${template.type}: ${jiraKey} ` : `${template.type}: `,
		});
	}
}

/**
 * 获取 Git 扩展
 */
function getGitExtension() {
	const vscodeGit = vscode.extensions.getExtension<GitExtension>('vscode.git');
	const gitExtension = vscodeGit && vscodeGit.exports;
	return gitExtension && gitExtension.getAPI(1);
}

/**
 * 检查是否首次使用
 */
async function checkFirstTimeUse(context: vscode.ExtensionContext): Promise<void> {
	const hasShownWelcome = context.globalState.get<boolean>('hasShownWelcome', false);
	
	if (!hasShownWelcome) {
		const result = await vscode.window.showInformationMessage(
			'欢迎使用智能 Git Commit！在提交输入框中输入 "/" 即可使用模板。是否现在配置 Jira 集成？',
			'配置 Jira',
			'稍后配置',
			'不再提示'
		);

		if (result === '配置 Jira') {
			await vscode.commands.executeCommand('smartCommit.configureJira');
		}

		await context.globalState.update('hasShownWelcome', true);
	}
}

export function deactivate() {
	console.log('智能 Git Commit 扩展已停用');
}

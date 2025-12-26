import * as vscode from 'vscode';
import axios, { AxiosInstance } from 'axios';

/**
 * Jira Issue 信息接口
 */
export interface JiraIssue {
	key: string;
	fields: {
		summary: string;
		status: {
			name: string;
		};
		timetracking?: {
			remainingEstimate?: string;
			remainingEstimateSeconds?: number;
		};
	};
	transitions?: JiraTransition[];
}

/**
 * Jira 状态转换接口
 */
export interface JiraTransition {
	id: string;
	name: string;
	to: {
		name: string;
	};
}

/**
 * Jira Issue 缓存
 */
interface JiraCache {
	issue: JiraIssue;
	transitions: JiraTransition[];
	timestamp: number;
}

/**
 * Jira 服务类
 */
export class JiraService {
	private axiosInstance: AxiosInstance | null = null;
	private config: vscode.WorkspaceConfiguration;
	private cache: Map<string, JiraCache> = new Map();
	private readonly CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

	constructor() {
		this.config = vscode.workspace.getConfiguration('smartCommit.jira');
		this.initializeAxios();
	}

	/**
	 * 初始化 Axios 实例
	 */
	private initializeAxios(): void {
		const apiUrl = this.config.get<string>('apiUrl');
		const email = this.config.get<string>('email');
		const apiToken = this.config.get<string>('apiToken');

		if (apiUrl && email && apiToken) {
			this.axiosInstance = axios.create({
				baseURL: apiUrl,
				headers: {
					'Authorization': `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`,
					'Content-Type': 'application/json',
				},
				timeout: 10000,
			});
		}
	}

	/**
	 * 检查 Jira 是否已配置
	 */
	public isConfigured(): boolean {
		const apiUrl = this.config.get<string>('apiUrl');
		const email = this.config.get<string>('email');
		const apiToken = this.config.get<string>('apiToken');
		const enabled = this.config.get<boolean>('enabled', true);

		return enabled && !!apiUrl && !!email && !!apiToken;
	}

	/**
	 * 从分支名称中提取 Jira Issue Key
	 * 例如: CON-1, CON-1-2, WOR-241, WOR-241-5 等
	 * 注意: WOR-241-5 中真正的编号是 WOR-241
	 */
	public extractJiraKeyFromBranch(branchName: string): string | null {
		// 匹配模式: 字母-数字 (忽略后面的 -数字)
		const match = branchName.match(/([A-Z]+)-(\d+)/i);
		if (match) {
			return `${match[1].toUpperCase()}-${match[2]}`;
		}
		return null;
	}

	/**
	 * 获取 Jira Issue 信息（带缓存）
	 */
	public async getIssue(issueKey: string): Promise<JiraIssue | null> {
		// 检查缓存
		const cached = this.cache.get(issueKey);
		if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
			return cached.issue;
		}

		if (!this.axiosInstance) {
			this.initializeAxios();
		}

		if (!this.axiosInstance) {
			vscode.window.showWarningMessage('请先配置 Jira API 信息');
			return null;
		}

		try {
			const response = await this.axiosInstance.get(`/rest/api/3/issue/${issueKey}`);
			const issue = response.data;
			
			// 更新缓存
			let cachedData = this.cache.get(issueKey);
			if (cachedData) {
				cachedData.issue = issue;
				cachedData.timestamp = Date.now();
			} else {
				this.cache.set(issueKey, {
					issue,
					transitions: [],
					timestamp: Date.now(),
				});
			}
			
			return issue;
		} catch (error: any) {
			if (error.response?.status === 404) {
				vscode.window.showWarningMessage(`未找到 Jira Issue: ${issueKey}`);
			} else {
				vscode.window.showErrorMessage(`获取 Jira Issue 失败: ${error.message}`);
			}
			return null;
		}
	}

	/**
	 * 获取 Issue 可用的状态转换（带缓存）
	 */
	public async getTransitions(issueKey: string): Promise<JiraTransition[]> {
		// 检查缓存
		const cached = this.cache.get(issueKey);
		if (cached && cached.transitions.length > 0 && Date.now() - cached.timestamp < this.CACHE_TTL) {
			return cached.transitions;
		}

		if (!this.axiosInstance) {
			this.initializeAxios();
		}

		if (!this.axiosInstance) {
			return [];
		}

		try {
			const response = await this.axiosInstance.get(`/rest/api/3/issue/${issueKey}/transitions`);
			const transitions = response.data.transitions || [];
			
			// 更新缓存
			let existing = this.cache.get(issueKey);
			if (existing) {
				existing.transitions = transitions;
				existing.timestamp = Date.now();
			} else {
				// 如果没有issue缓存，创建一个临时的
				this.cache.set(issueKey, {
					issue: null as any, // 临时占位，后续会被getIssue更新
					transitions,
					timestamp: Date.now(),
				});
			}
			
			return transitions;
		} catch (error: any) {
			console.error(`获取 Jira 转换失败: ${error.message}`);
			return [];
		}
	}
	
	/**
	 * 获取 Issue 信息和转换（一次性获取，带缓存）
	 */
	public async getIssueWithTransitions(issueKey: string): Promise<{ issue: JiraIssue | null; transitions: JiraTransition[] }> {
		// 检查缓存
		const cached = this.cache.get(issueKey);
		if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
			return { issue: cached.issue, transitions: cached.transitions };
		}

		// 并行获取
		const [issue, transitions] = await Promise.all([
			this.getIssue(issueKey),
			this.getTransitions(issueKey),
		]);

		return { issue, transitions };
	}
	
	/**
	 * 清除缓存
	 */
	public clearCache(issueKey?: string): void {
		if (issueKey) {
			this.cache.delete(issueKey);
		} else {
			this.cache.clear();
		}
	}

	/**
	 * 将 Jira 时间格式转换为小时
	 * 例如: "1w 2d 4h 30m" -> "1w 2d 4h 30m"
	 * 或者从秒数转换: 3600 -> "1h"
	 */
	public formatTimeTracking(seconds?: number): string {
		if (!seconds || seconds === 0) {
			return '1h'; // 默认值
		}

		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);

		if (hours > 0 && minutes > 0) {
			return `${hours}h ${minutes}m`;
		} else if (hours > 0) {
			return `${hours}h`;
		} else if (minutes > 0) {
			return `${minutes}m`;
		}

		return '1h';
	}

	/**
	 * 重新加载配置
	 */
	public reloadConfig(): void {
		this.config = vscode.workspace.getConfiguration('smartCommit.jira');
		this.axiosInstance = null;
		this.cache.clear(); // 清除所有缓存
		this.initializeAxios();
	}
}


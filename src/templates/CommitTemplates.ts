/**
 * 提交模板接口
 */
export interface CommitTemplate {
	readonly type: string;
	readonly description: string;
	readonly hasJiraSupport: boolean;
	readonly requiresComment: boolean;
}

/**
 * 提交模板列表
 */
const CommitTemplates: Array<CommitTemplate> = [
	{
		type: 'feat',
		description: '新功能',
		hasJiraSupport: true,
		requiresComment: true,
	},
	{
		type: 'fix',
		description: '修复 Bug',
		hasJiraSupport: true,
		requiresComment: true,
	},
	{
		type: 'docs',
		description: '文档更新',
		hasJiraSupport: true,
		requiresComment: false,
	},
	{
		type: 'style',
		description: '代码格式修改(不影响功能)',
		hasJiraSupport: true,
		requiresComment: false,
	},
	{
		type: 'refactor',
		description: '代码重构',
		hasJiraSupport: true,
		requiresComment: true,
	},
	{
		type: 'perf',
		description: '性能优化',
		hasJiraSupport: true,
		requiresComment: true,
	},
	{
		type: 'test',
		description: '增加或修改测试',
		hasJiraSupport: true,
		requiresComment: false,
	},
	{
		type: 'chore',
		description: '构建过程或辅助工具的变动',
		hasJiraSupport: true,
		requiresComment: false,
	},
	{
		type: 'build',
		description: '构建系统或外部依赖的更改',
		hasJiraSupport: true,
		requiresComment: false,
	},
	{
		type: 'ci',
		description: 'CI配置文件和脚本的更改',
		hasJiraSupport: true,
		requiresComment: false,
	},
	{
		type: 'revert',
		description: '回退之前的提交',
		hasJiraSupport: true,
		requiresComment: true,
	},
	{
		type: 'merge',
		description: '合并分支',
		hasJiraSupport: false,
		requiresComment: false,
	},
];

export default CommitTemplates;


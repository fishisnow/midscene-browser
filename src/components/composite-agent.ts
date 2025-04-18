import {callToGetJSONObject} from '@midscene/core/ai-model';
import {systemPrompt, automationUserPrompt} from "./composite-prompts.ts";
import type {WebPage} from '@midscene/web';
import {descriptionOfTree} from '@midscene/shared/extractor';
import {imageInfoOfBase64} from '@midscene/shared/img';

export interface ActivityItem {
    activity: 'action' | 'query' | 'assert';
    activity_prompt: string;
    executionTime?: number;
}

// 新增任务计划结果接口
export interface TaskPlan {
    activities: ActivityItem[];
}

// 新增任务执行结果接口
export interface TaskExecutionResult {
    success: boolean;
    activities: ActivityItem[];
    completedActivities: number;
    results: any[];
    error?: string;
}

export function describeSize(size: { width: number; height: number }) {
    return `${size.width} x ${size.height}`;
}

export class CompositeAgent<PageType extends WebPage = WebPage> {
    page: PageType;
    aiVendorFn: (...args: Array<any>) => Promise<any> = callToGetJSONObject;
    getAgent: (forceSameTabNavigation?: boolean) => any | null;
    onProgressUpdate?: (text: string) => void;
    onActivityStart?: (index: number) => void;
    onActivityComplete?: (index: number, executionTime: number) => void;
    onActivityFail?: (index: number, error: string) => void;
    onPlanComplete?: (plan: TaskPlan) => void;

    constructor(page: PageType, getAgent: (forceSameTabNavigation?: boolean) => any | null) {
        this.page = page;
        this.getAgent = getAgent;
    }

    /**
     * 执行单个活动
     * @param activity 活动项
     * @param activeAgent
     * @returns 活动执行结果
     */
    async executeActivity(activity: ActivityItem, activeAgent: any | null): Promise<any> {
        const {activity: activityType, activity_prompt} = activity;
        // 更新进度提示
        const progressText = `${activityType === 'action' ? '执行操作' :
            activityType === 'query' ? '查询信息' : '验证断言'}: ${activity_prompt}`;
        if (this.onProgressUpdate) {
            this.onProgressUpdate(progressText);
        }

        const startTime = Date.now();
        try {
            let result;
            switch (activityType) {
                case 'action':
                    result = await activeAgent.aiAction(activity_prompt);
                    break;
                case 'query':
                    result = await activeAgent.aiQuery(activity_prompt);
                    break;
                case 'assert':
                    result = await activeAgent.aiAssert(activity_prompt);
                    break;
                default:
                    throw new Error(`未知的活动类型: ${activityType}`);
            }

            const executionTime = Date.now() - startTime;
            activity.executionTime = executionTime;

            if (this.onActivityComplete) {
                this.onActivityComplete(0, executionTime);
            }

            return result;
        } catch (error) {
            const executionTime = Date.now() - startTime;
            activity.executionTime = executionTime;
            throw error;
        }
    }

    /**
     * 将知识库对象转换为更易于处理的格式
     * @param knowledgeBase 知识库配置对象
     * @returns 格式化的知识库字符串
     */
    formatKnowledgeBase(knowledgeBase?: Record<string, string>): string {
        if (!knowledgeBase || Object.keys(knowledgeBase).length === 0) {
            return '';
        }

        // 如果只有一个知识项，直接返回其内容
        if (Object.keys(knowledgeBase).length === 1) {
            return Object.values(knowledgeBase)[0] || '';
        }

        // 多项知识时，转换为简单的文本格式
        return Object.entries(knowledgeBase)
            .map(([name, content]) => `${name}: ${content}`)
            .join('\n\n');
    }

    /**
     * 规划任务执行步骤
     * @param taskPrompt 用户任务描述
     * @param knowledgeBase 高级知识库配置
     * @returns 任务计划
     */
    async planTask(taskPrompt: string, knowledgeBase?: Record<string, string>): Promise<{
        plan: TaskPlan;
        activeAgent: any
    }> {
        if (this.onProgressUpdate) {
            this.onProgressUpdate('正在分析任务并规划执行步骤...');
        }

        try {
            const activeAgent = this.getAgent(); // 优先使用传入的 actionAgent
            const context = await activeAgent?.getUIContext();
            const contentTree = descriptionOfTree(context.tree);
            const {screenshotBase64} = context;
            let width: number;
            let height: number;

            if (context.size) {
                ({width, height} = context.size);
            } else {
                const imgSize = await imageInfoOfBase64(screenshotBase64);
                ({width, height} = imgSize);
            }
            const sizeDescription = describeSize({width, height});
            const pageDescription = `The size of the page: ${sizeDescription} \n Some of the elements are marked with a rectangle in the screenshot, some are not. \n The page elements tree:\n${contentTree}`;

            // 格式化知识库内容
            const highPriorityKnowledge = this.formatKnowledgeBase(knowledgeBase);

            const userInstructionPrompt = await automationUserPrompt().format({
                pageDescription,
                taskBackgroundContext: taskPrompt,
                highPriorityKnowledge
            });

            const msgs = [
                {role: 'system', content: systemPrompt},
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image_url',
                            image_url: {
                                url: screenshotBase64,
                                detail: 'high',
                            },
                        },
                        {
                            type: 'text',
                            text: userInstructionPrompt,
                        },
                    ],
                },
            ];

            const res = await this.aiVendorFn(msgs, -1);
            console.log(res);
            
            // 检查返回结果是否为字符串，如果是则表示AI无法规划任务
            if (typeof res.content === 'string') {
                throw new Error(`AI无法规划任务: ${res.content}`);
            }
            
            // 检查返回的内容是否符合预期的数组结构
            if (!Array.isArray(res.content) || res.content.length === 0) {
                throw new Error('AI返回的结果格式不正确，无法解析为活动列表');
            }
            
            try {
                const activities = (res.content as Array<{
                    value: Array<{ key: string | string[]; value: string }>
                }>).map(item => {
                    // 检查每个item是否有value属性且为数组
                    if (!item.value || !Array.isArray(item.value)) {
                        throw new Error('活动项结构不正确');
                    }
                    
                    const activityObj: any = {};
                    item.value.forEach(entry => {
                        const key = Array.isArray(entry.key) ? entry.key[0] : entry.key;
                        activityObj[key] = entry.value;
                    });
                    
                    // 验证必需的字段是否存在
                    if (!activityObj.activity || !activityObj.activity_prompt) {
                        throw new Error('活动项缺少必需的字段');
                    }
                    
                    return activityObj as ActivityItem;
                });

                if (!Array.isArray(activities) || activities.length === 0) {
                    throw new Error('AI 返回的活动列表无效或为空');
                }

                console.log(`规划了 ${activities.length} 个活动`);
                if (this.onProgressUpdate) {
                    this.onProgressUpdate(`已规划 ${activities.length} 个执行步骤`);
                }

                const taskPlan = {activities};

                // 通知规划完成
                if (this.onPlanComplete) {
                    this.onPlanComplete(taskPlan);
                }

                return {plan: taskPlan, activeAgent};
            } catch (parseError: any) {
                console.error('解析AI返回的活动列表失败', parseError);
                // 如果是解析错误，提供更详细的错误信息
                const errorMessage = `无法解析AI返回的任务计划: ${parseError.message}。原始响应: ${JSON.stringify(res.content).substring(0, 200)}...`;
                throw new Error(errorMessage);
            }
        } catch (error) {
            console.error('规划任务失败', error);
            if (this.onProgressUpdate) {
                this.onProgressUpdate(`规划失败: ${error instanceof Error ? error.message : String(error)}`);
            }
            throw error;
        }
    }

    /**
     * 执行已规划的活动
     * @param plan 任务计划
     * @param activeAgent
     * @returns 执行结果
     */
    async executePlannedActivities(plan: TaskPlan, activeAgent: any): Promise<TaskExecutionResult> {
        try {
            const {activities} = plan;
            if (this.onProgressUpdate) {
                this.onProgressUpdate(`开始执行 ${activities.length} 个步骤...`);
            }

            const results = [];
            let completedActivities = 0;

            for (let i = 0; i < activities.length; i++) {
                const activity = activities[i];
                console.log(`执行活动 ${i + 1}/${activities.length}: ${activity.activity} - ${activity.activity_prompt}`);

                if (this.onActivityStart) {
                    this.onActivityStart(i);
                }

                const startTime = Date.now();
                try {
                    const result = await this.executeActivity(activity, activeAgent);
                    const executionTime = Date.now() - startTime;

                    activities[i].executionTime = executionTime;

                    if (this.onActivityComplete) {
                        this.onActivityComplete(i, executionTime);
                    }

                    results.push(result);
                    completedActivities++;
                } catch (error) {
                    console.error(`活动执行失败: ${activity.activity_prompt}`, error);
                    // 添加执行时间即使失败
                    const executionTime = Date.now() - startTime;
                    activities[i].executionTime = executionTime;

                    const errorMessage = error instanceof Error ? error.message : String(error);
                    activities[i].activity_prompt = `错误: ${errorMessage}。原任务: ${activity.activity_prompt}`;

                    // 调用活动失败回调
                    if (this.onActivityFail) {
                        this.onActivityFail(i, errorMessage);
                    }

                    // 将错误添加到结果中
                    results.push({error: errorMessage});
                    break; // 出错后停止执行后续活动
                }
            }

            if (this.onProgressUpdate) {
                this.onProgressUpdate('所有步骤执行完成！');
            }

            return {
                success: completedActivities === activities.length,
                activities: activities,
                completedActivities: completedActivities,
                results: results
            };
        } catch (error) {
            console.error('执行任务失败', error);
            if (this.onProgressUpdate) {
                this.onProgressUpdate(`执行失败: ${error instanceof Error ? error.message : String(error)}`);
            }
            return {
                success: false,
                activities: plan.activities,
                completedActivities: 0,
                results: [],
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    async destroy() {
        await this.page.destroy();
    }
}

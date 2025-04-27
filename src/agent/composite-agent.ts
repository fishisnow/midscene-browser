import {callToGetJSONObject} from '@midscene/core/ai-model';
import {getSystemPrompt, automationUserPrompt} from "./composite-prompts.ts";
import {descriptionOfTree} from '@midscene/shared/extractor';
import {imageInfoOfBase64} from '@midscene/shared/img';
import i18n from '../locales/i18n';

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

export class CompositeAgent {
    aiVendorFn: (...args: Array<any>) => Promise<any> = callToGetJSONObject;
    onProgressUpdate?: (text: string) => void;
    onActivityStart?: (index: number) => void;
    onActivityComplete?: (index: number, executionTime: number) => void;
    onActivityFail?: (index: number, error: string) => void;
    onPlanComplete?: (plan: TaskPlan) => void;

    // 获取当前语言
    getCurrentLanguage(): string {
        return i18n.language || 'zh';
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
        const progressText = this.getCurrentLanguage() === 'en' 
            ? `${activityType === 'action' ? 'Executing action' : 
               activityType === 'query' ? 'Querying information' : 'Verifying assertion'}: ${activity_prompt}`
            : `${activityType === 'action' ? '执行操作' :
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
                    const errorMsg = this.getCurrentLanguage() === 'en' 
                        ? `Unknown activity type: ${activityType}`
                        : `未知的活动类型: ${activityType}`;
                    throw new Error(errorMsg);
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
     * @param activeAgent
     * @param knowledgeBase 高级知识库配置
     * @returns 任务计划
     */
    async planTask(taskPrompt: string, activeAgent: any, knowledgeBase?: Record<string, string>): Promise<TaskPlan> {
        const isEnglish = this.getCurrentLanguage() === 'en';
        if (this.onProgressUpdate) {
            this.onProgressUpdate(isEnglish 
                ? 'Analyzing task and planning execution steps...' 
                : '正在分析任务并规划执行步骤...');
        }

        try {
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
                {role: 'system', content: getSystemPrompt(this.getCurrentLanguage())},
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
                throw new Error(isEnglish 
                    ? `AI cannot plan task: ${res.content}` 
                    : `AI无法规划任务: ${res.content}`);
            }
            
            // 检查返回的内容是否符合预期的数组结构
            if (!Array.isArray(res.content) || res.content.length === 0) {
                throw new Error(isEnglish
                    ? 'The format of the result returned by AI is incorrect and cannot be parsed as an activity list'
                    : 'AI返回的结果格式不正确，无法解析为活动列表');
            }
            
            try {
                const activities = (res.content as Array<{
                    value: Array<{ key: string | string[]; value: string }>
                }>).map(item => {
                    // 检查每个item是否有value属性且为数组
                    if (!item.value || !Array.isArray(item.value)) {
                        throw new Error(isEnglish 
                            ? 'Incorrect activity item structure' 
                            : '活动项结构不正确');
                    }
                    
                    const activityObj: any = {};
                    item.value.forEach(entry => {
                        const key = Array.isArray(entry.key) ? entry.key[0] : entry.key;
                        activityObj[key] = entry.value;
                    });
                    
                    // 验证必需的字段是否存在
                    if (!activityObj.activity || !activityObj.activity_prompt) {
                        throw new Error(isEnglish 
                            ? 'Activity item is missing required fields' 
                            : '活动项缺少必需的字段');
                    }
                    
                    return activityObj as ActivityItem;
                });

                if (!Array.isArray(activities) || activities.length === 0) {
                    throw new Error(isEnglish 
                        ? 'The activity list returned by AI is invalid or empty'
                        : 'AI 返回的活动列表无效或为空');
                }

                console.log(`规划了 ${activities.length} 个活动`);
                if (this.onProgressUpdate) {
                    this.onProgressUpdate(isEnglish
                        ? `Planned ${activities.length} execution steps`
                        : `已规划 ${activities.length} 个执行步骤`);
                }

                const taskPlan = {activities};

                // 通知规划完成
                if (this.onPlanComplete) {
                    this.onPlanComplete(taskPlan);
                }

                return taskPlan
            } catch (parseError: any) {
                console.error(isEnglish 
                    ? 'Failed to parse the activity list returned by AI' 
                    : '解析AI返回的活动列表失败', parseError);
                // 如果是解析错误，提供更详细的错误信息
                const errorMessage = isEnglish
                    ? `Unable to parse AI task plan: ${parseError.message}. Original response: ${JSON.stringify(res.content).substring(0, 200)}...`
                    : `无法解析AI返回的任务计划: ${parseError.message}。原始响应: ${JSON.stringify(res.content).substring(0, 200)}...`;
                throw new Error(errorMessage);
            }
        } catch (error) {
            console.error(isEnglish ? 'Task planning failed' : '规划任务失败', error);
            if (this.onProgressUpdate) {
                this.onProgressUpdate(isEnglish
                    ? `Planning failed: ${error instanceof Error ? error.message : String(error)}`
                    : `规划失败: ${error instanceof Error ? error.message : String(error)}`);
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
        const isEnglish = this.getCurrentLanguage() === 'en';
        try {
            const {activities} = plan;
            if (this.onProgressUpdate) {
                this.onProgressUpdate(isEnglish
                    ? `Starting execution of ${activities.length} steps...`
                    : `开始执行 ${activities.length} 个步骤...`);
            }

            const results = [];
            let completedActivities = 0;

            for (let i = 0; i < activities.length; i++) {
                const activity = activities[i];
                console.log(`${isEnglish ? 'Executing activity' : '执行活动'} ${i + 1}/${activities.length}: ${activity.activity} - ${activity.activity_prompt}`);

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
                    console.error(isEnglish 
                        ? `Activity execution failed: ${activity.activity_prompt}` 
                        : `活动执行失败: ${activity.activity_prompt}`, error);
                    // 添加执行时间即使失败
                    const executionTime = Date.now() - startTime;
                    activities[i].executionTime = executionTime;

                    const errorMessage = error instanceof Error ? error.message : String(error);
                    activities[i].activity_prompt = isEnglish
                        ? `Error: ${errorMessage}. Original task: ${activity.activity_prompt}`
                        : `错误: ${errorMessage}。原任务: ${activity.activity_prompt}`;

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
                this.onProgressUpdate(isEnglish 
                    ? 'All steps executed!' 
                    : '所有步骤执行完成！');
            }

            return {
                success: completedActivities === activities.length,
                activities: activities,
                completedActivities: completedActivities,
                results: results
            };
        } catch (error) {
            console.error(isEnglish ? 'Task execution failed' : '执行任务失败', error);
            if (this.onProgressUpdate) {
                this.onProgressUpdate(isEnglish
                    ? `Execution failed: ${error instanceof Error ? error.message : String(error)}`
                    : `执行失败: ${error instanceof Error ? error.message : String(error)}`);
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
}

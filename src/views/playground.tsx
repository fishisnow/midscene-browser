import type {UIContext} from '@midscene/core';
import {overrideAIConfig} from '@midscene/core/env';
import {
    EnvConfig,
    type PlaygroundResult,
    useEnvConfig,
} from '@midscene/visualizer';
import {Form, message, Button, Progress, Modal, Input} from 'antd';
import {SettingOutlined, GithubOutlined, BookOutlined} from '@ant-design/icons';
import {useCallback, useEffect, useRef, useState} from 'react';
import {CompositeAgent, TaskPlan} from '../agent/composite-agent.ts';
import {TaskList, TaskWithStatus, TaskStatus} from './task-list.tsx';
import {KnowledgeCarousel} from './knowledge-carousel.tsx';
import {ExecuteButton} from './popup/components/execute-button.tsx';
import {RetryButton} from './popup/components/retry-button.tsx';

// Header组件定义
const Header = ({title, children}: { title: string, children?: React.ReactNode }) => {
    return (
        <div className="header-nav">
            <div className="logo-container">
                <img src="/icons/Midscene.png" alt="Logo" className="midscene-logo"/>
                <span className="logo-text">{title}</span>
            </div>
            {children}
        </div>
    );
};

export interface PlaygroundProps {
    getAgent: (forceSameTabNavigation?: boolean) => any | null;
    showContextPreview?: boolean;
    dryMode?: boolean;
}

const ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED = 'NOT_IMPLEMENTED_AS_DESIGNED';

const formatErrorMessage = (e: any): string => {
    const errorMessage = e?.message || '';
    if (errorMessage.includes('of different extension')) {
        return 'Conflicting extension detected. Please disable the suspicious plugins and refresh the page. Guide: https://midscenejs.com/quick-experience.html#faq';
    }
    if (!errorMessage?.includes(ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED)) {
        return errorMessage;
    }
    return 'Unknown error';
};

// Blank result template
const blankResult = {
    result: null,
    dump: null,
    reportHTML: null,
    error: null,
};

// 添加执行阶段状态枚举
enum ExecutionPhase {
    IDLE = 'idle',
    PLANNING = 'planning',
    EXECUTING = 'executing',
    COMPLETED = 'completed',
    ERROR = 'error'
}

// 设置对话框组件
const SettingsModal = ({visible, onClose}: { visible: boolean; onClose: () => void }) => {
    return (
        <Modal
            title="环境配置"
            open={visible}
            onCancel={onClose}
            destroyOnClose={true}
            maskClosable={true}
            centered={true}
            className="settings-modal"
            footer={[
                <Button key="close" type="primary" onClick={onClose}>
                    确认
                </Button>
            ]}
            width={700}
        >
            <div className="settings-modal-content">
                <h3>浏览器内请求配置</h3>
                <p className="settings-description">
                    这些设置将影响浏览器自动化的行为和性能。请根据需要进行调整。
                </p>
                <EnvConfig/>
            </div>
        </Modal>
    );
};

// Browser Extension Playground Component
export function BrowserExtensionPlayground({
                                               getAgent,
                                               showContextPreview = true,
                                           }: PlaygroundProps) {
    // State management
    const [uiContextPreview, setUiContextPreview] = useState<
        UIContext | undefined
    >(undefined);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<PlaygroundResult | null>(null);
    const [currentActivityIndex, setCurrentActivityIndex] = useState(-1);
    const [tasksWithStatus, setTasksWithStatus] = useState<TaskWithStatus[]>([]);
    const [selectedKnowledge, setSelectedKnowledge] = useState<string>('');
    const [advancedKnowledge, setAdvancedKnowledge] = useState<Record<string, string>>({});
    // 新增执行阶段状态
    const [executionPhase, setExecutionPhase] = useState<ExecutionPhase>(ExecutionPhase.IDLE);
    // 添加设置对话框可见性状态
    const [settingsVisible, setSettingsVisible] = useState(false);
    // 添加知识模态框可见性
    const [showKnowledgeModal, setShowKnowledgeModal] = useState(false);
    // 输入内容
    const [inputValue, setInputValue] = useState('');
    // 存储当前任务计划

    // Form and environment configuration
    const [form] = Form.useForm();
    const [knowledgeForm] = Form.useForm();
    const inputRef = useRef<any>(null);

    const {config} = useEnvConfig();
    const forceSameTabNavigation = useEnvConfig(
        (state) => state.forceSameTabNavigation,
    );

    const compositeAgentRef = useRef<CompositeAgent | null>(null);
    const currentRunningIdRef = useRef<number | null>(0);
    const interruptedFlagRef = useRef<Record<number, boolean>>({});

    // Override AI configuration
    useEffect(() => {
        overrideAIConfig(config as any);
    }, [config]);

    // Initialize context preview
    useEffect(() => {
        if (uiContextPreview) return;
        if (!showContextPreview) return;

        getAgent(forceSameTabNavigation)
            ?.getUIContext()
            .then((context: UIContext) => {
                setUiContextPreview(context);
            })
            .catch((e: any) => {
                message.error('获取 UI 上下文失败');
                console.error(e);
            });
    }, [uiContextPreview, showContextPreview, getAgent, forceSameTabNavigation]);

    // 处理活动开始事件
    const handleActivityStart = (index: number) => {
        setTasksWithStatus(prevTasks => {
            const newTasks = [...prevTasks];
            if (newTasks[index]) {
                newTasks[index] = {
                    ...newTasks[index],
                    status: TaskStatus.RUNNING,
                    startTime: Date.now()
                };
            }
            return newTasks;
        });
        setCurrentActivityIndex(index);
    };

    // 处理活动完成事件
    const handleActivityComplete = (index: number, executionTime: number) => {
        setTasksWithStatus(prevTasks => {
            const newTasks = [...prevTasks];
            if (newTasks[index]) {
                newTasks[index] = {
                    ...newTasks[index],
                    isCompleted: true,
                    status: TaskStatus.COMPLETED,
                    executionTime: executionTime
                };
            }
            // 更新标题显示完成进度
            const completedCount = newTasks.filter(task => task.isCompleted || task.status === TaskStatus.COMPLETED).length;
            document.title = `Web自动化测试 (${completedCount}/${newTasks.length})`;

            return newTasks;
        });
    };

    // 处理活动失败事件
    const handleActivityFail = (index: number, error: string) => {
        setTasksWithStatus(prevTasks => {
            const newTasks = [...prevTasks];
            if (newTasks[index]) {
                newTasks[index] = {
                    ...newTasks[index],
                    status: TaskStatus.FAILED,
                    error: error
                };
            }
            return newTasks;
        });

        // 更新执行阶段为错误
        setExecutionPhase(ExecutionPhase.ERROR);
    };

    // 处理任务规划完成事件
    const handlePlanComplete = (plan: TaskPlan) => {
        console.log('规划完成:', plan);

        // 创建任务列表，初始时都标记为待执行
        const initialTasksWithStatus = plan.activities.map((activity, _index) => ({
            ...activity,
            isCompleted: false,
            executionTime: 0,
            status: TaskStatus.PENDING,
            startTime: null,
            error: null
        }));

        setTasksWithStatus(initialTasksWithStatus);
        setExecutionPhase(ExecutionPhase.EXECUTING);

        // 更新标题显示任务总数
        document.title = `Web自动化测试 (0/${plan.activities.length})`;
    };

    // 处理输入框变化
    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInputValue(e.target.value);
        // 将输入值实时绑定到表单的 prompt 字段
        form.setFieldsValue({prompt: e.target.value});
    };

    // 处理执行按钮点击
    const handleExecuteClick = () => {
        if (!inputValue || loading) return;

        // 执行
        handleRun();

        // 不需要在这里清空输入框，因为 handleRun 已经会清空
    };

    // 处理重新运行
    const handleRerunClick = () => {
        handleRun();
    };

    // 处理添加知识提交
    const handleAddKnowledgeSubmit = () => {
        knowledgeForm.submit();
    };

    // 处理添加知识
    const handleAddKnowledge = (values: { name: string; content: string }) => {
        const newKnowledge = {
            ...advancedKnowledge,
            [values.name]: values.content
        };
        setAdvancedKnowledge(newKnowledge);
        setShowKnowledgeModal(false);
        message.success(`知识 "${values.name}" 已添加`);
    };

    // Handle form submission
    const handleRun = useCallback(async () => {
        const value = form.getFieldsValue();
        if (!value.prompt) {
            message.error('请输入任务描述');
            return;
        }

        const startTime = Date.now();

        setLoading(true);
        setExecutionPhase(ExecutionPhase.PLANNING);
        setResult(null);
        setCurrentActivityIndex(-1);
        // 不清空任务列表，当重新运行时需要重置
        if (!showRetryButton) {
            setTasksWithStatus([]);
        }
        const result: PlaygroundResult = {...blankResult};

        const thisRunningId = Date.now();
        try {
            currentRunningIdRef.current = thisRunningId;
            interruptedFlagRef.current[thisRunningId] = false;

            const compositeAgent = new CompositeAgent(
                getAgent(forceSameTabNavigation)?.page,
                getAgent
            );

            // 设置进度提示回调
            compositeAgent.onProgressUpdate = (_text: string) => {
                if (interruptedFlagRef.current[thisRunningId]) {
                    return;
                }
            };

            // 设置活动开始回调
            compositeAgent.onActivityStart = (index: number) => {
                if (interruptedFlagRef.current[thisRunningId]) {
                    return;
                }
                handleActivityStart(index);
            };

            // 设置活动完成回调
            compositeAgent.onActivityComplete = (index: number, executionTime: number) => {
                if (interruptedFlagRef.current[thisRunningId]) {
                    return;
                }
                handleActivityComplete(index, executionTime);
            };

            // 设置活动失败回调
            compositeAgent.onActivityFail = (index: number, error: string) => {
                if (interruptedFlagRef.current[thisRunningId]) {
                    return;
                }
                handleActivityFail(index, error);
            };

            // 设置规划完成回调
            compositeAgent.onPlanComplete = (plan: TaskPlan) => {
                if (interruptedFlagRef.current[thisRunningId]) {
                    return;
                }
                handlePlanComplete(plan);
            };

            compositeAgentRef.current = compositeAgent;

            // 分两步执行：先规划，后执行
            try {
                // 1. 规划任务
                try {
                    const {plan, activeAgent} = await compositeAgent.planTask(value.prompt, advancedKnowledge);

                    if (interruptedFlagRef.current[thisRunningId]) {
                        console.log('任务规划后被中断');
                        return;
                    }

                    // 2. 执行已规划的任务
                    const taskResult = await compositeAgent.executePlannedActivities(plan, activeAgent);

                    if (interruptedFlagRef.current[thisRunningId]) {
                        console.log('任务执行期间被中断', taskResult);
                        return;
                    }

                    // 将每个活动的执行结果保存到对应的任务中
                    if (taskResult.results && taskResult.results.length > 0) {
                        setTasksWithStatus(prevTasks => {
                            const newTasks = [...prevTasks];
                            taskResult.results.forEach((result, idx) => {
                                if (newTasks[idx]) {
                                    newTasks[idx] = {
                                        ...newTasks[idx],
                                        result: result
                                    };
                                }
                            });
                            return newTasks;
                        });
                    }

                    // 设置执行结果
                    if (taskResult.success) {
                        result.result = taskResult.results;
                        setExecutionPhase(ExecutionPhase.COMPLETED);
                    } else {
                        result.error = taskResult.error || null;
                        setExecutionPhase(ExecutionPhase.ERROR);
                    }
                } catch (planError: any) {
                    console.error('任务规划失败:', planError);
                    result.error = formatErrorMessage(planError);
                    setExecutionPhase(ExecutionPhase.ERROR);
                }
            } catch (e: any) {
                console.error('任务执行出错:', e);
                result.error = formatErrorMessage(e);
                setExecutionPhase(ExecutionPhase.ERROR);
            }
        } catch (e: any) {
            result.error = formatErrorMessage(e);
            console.error(e);
            setExecutionPhase(ExecutionPhase.ERROR);
        }

        if (interruptedFlagRef.current[thisRunningId]) {
            console.log('已中断，结果是', result);
            return;
        }

        try {
            // 尝试获取转储数据
            const activeAgent = getAgent(forceSameTabNavigation);
            if (activeAgent?.dumpDataString) {
                result.dump = activeAgent.dumpDataString()
                    ? JSON.parse(activeAgent.dumpDataString())
                    : null;
            }
            console.log(result);
        } catch (e) {
            console.error(e);
        }

        try {
            // 销毁页面
            await compositeAgentRef.current?.destroy();
            console.log('页面已销毁');
        } catch (e) {
            console.error(e);
        }

        compositeAgentRef.current = null;
        setResult(result);
        setLoading(false);

        // 如果没有开始执行任务，就清空表单和输入框内容
        if (executionPhase !== ExecutionPhase.EXECUTING && executionPhase !== ExecutionPhase.COMPLETED) {
            form.resetFields();
            setInputValue('');
        }

        console.log(`执行时间: ${Date.now() - startTime}毫秒`);
    }, [form, getAgent, forceSameTabNavigation, advancedKnowledge]);

    // 处理重试操作
    const handleRetry = useCallback(() => {
        // 重新执行任务但保留错误状态
        if (result?.error) {
            // 保留任务列表，但清空错误状态
            setTasksWithStatus(prevTasks => prevTasks.map(task => ({
                ...task,
                status: task.status === TaskStatus.FAILED ? TaskStatus.PENDING : task.status,
                error: null
            })));
        }

        // 重新执行任务
        handleRun();
    }, [handleRun, result]);

    // 更新知识库配置
    const handleAdvancedKnowledgeChange = (value: Record<string, string>) => {
        setAdvancedKnowledge(value);
    };

    // 处理知识选择
    const handleKnowledgeSelected = (name: string) => {
        setSelectedKnowledge(name);
    };

    // 处理设置按钮点击
    const handleOpenSettings = () => {
        setSettingsVisible(true);
    };

    // 处理设置对话框关闭
    const handleCloseSettings = () => {
        setSettingsVisible(false);
    };

    // 计算显示相关数据
    const completedTasks = tasksWithStatus.filter(t => t.isCompleted || t.status === TaskStatus.COMPLETED);
    const errorTasks = tasksWithStatus.filter(t => t.status === TaskStatus.FAILED);
    const hasErrors = errorTasks.length > 0;
    const completionPercentage = tasksWithStatus.length
        ? Math.round((completedTasks.length / tasksWithStatus.length) * 100)
        : 0;
    const showRetryButton = (executionPhase === ExecutionPhase.COMPLETED || executionPhase === ExecutionPhase.ERROR) && !loading;

    // 当所有任务完成时，更新执行阶段
    useEffect(() => {
        if (tasksWithStatus.length > 0 && !loading) {
            if (completedTasks.length === tasksWithStatus.length) {
                setExecutionPhase(ExecutionPhase.COMPLETED);
            } else if (hasErrors) {
                setExecutionPhase(ExecutionPhase.ERROR);
            }
        }
    }, [tasksWithStatus, completedTasks.length, hasErrors, loading]);

    return (
        <div className="playground-container">
            <Header title="助手">
                <div className="header-actions">
                    <Button
                        type="text"
                        icon={<GithubOutlined/>}
                        onClick={() => window.open('https://github.com/midsceneai/midscene', '_blank')}
                    />
                    <Button
                        type="text"
                        icon={<SettingOutlined/>}
                        onClick={handleOpenSettings}
                    />
                </div>
            </Header>

            <div className="playground-content">
                {/* 只有在有任务时显示知识卡片 */}
                {tasksWithStatus.length > 0 && selectedKnowledge && (
                    <div className="knowledge-indicator-container">
                        <div className="selected-knowledge-indicator">
                            <BookOutlined className="knowledge-icon"/>
                            <span>已选择知识: {selectedKnowledge}</span>
                        </div>
                    </div>
                )}

                <div className="conversation-area">
                    {tasksWithStatus.length > 0 && (
                        <div className="task-statistics">
                            <div className="stat-item">
                                <span>任务进度</span>
                                <Progress
                                    percent={completionPercentage}
                                    size="small"
                                    status={hasErrors ? "exception" : "active"}
                                />
                            </div>
                            <div className="stat-details">
                                <span>完成任务: {completedTasks.length}/{tasksWithStatus.length}</span>
                                {hasErrors && <span className="error-count">错误: {errorTasks.length}</span>}
                            </div>
                        </div>
                    )}

                    <div className="tasks-container">
                        {loading && executionPhase === ExecutionPhase.PLANNING && tasksWithStatus.length === 0 ? (
                            <div className="task-list-placeholder">
                                <div className="loading-dots">
                                    <div className="dot"></div>
                                    <div className="dot"></div>
                                    <div className="dot"></div>
                                </div>
                                <div>正在思考中...</div>
                            </div>
                        ) : tasksWithStatus.length === 0 && !loading ? (
                            <div className="empty-state">
                                {/* 没有任务时，显示知识卡片 */}
                                <div className="empty-knowledge-container">
                                    <KnowledgeCarousel
                                        onChange={handleAdvancedKnowledgeChange}
                                        onSelected={handleKnowledgeSelected}
                                        selectedKnowledge={selectedKnowledge}
                                    />
                                </div>

                                <div className="empty-icon">
                                    <BookOutlined/>
                                </div>
                                <div className="empty-text">在下方输入您的问题</div>
                            </div>
                        ) : (
                            <TaskList
                                tasks={tasksWithStatus}
                                currentTaskIndex={currentActivityIndex}
                                loading={loading}
                                showTaskStatus={true}
                                error={result?.error ? new Error(result.error) : undefined}
                                onRetry={handleRetry}
                            />
                        )}
                    </div>
                </div>

                <div className="footer-input-area">
                    {showRetryButton && !loading && (
                        <div className="retry-button-container">
                            <RetryButton
                                onClick={handleRerunClick}
                                text="重新运行"
                            />
                        </div>
                    )}

                    <div className="input-wrapper">
                        <Form form={form}>
                            <Form.Item name="prompt">
                                <div className="textarea-container">
                                    <div className="input-with-button">
                                        <Input.TextArea
                                            ref={inputRef}
                                            value={inputValue}
                                            onChange={handleInputChange}
                                            onPressEnter={(e) => {
                                                if (!e.shiftKey) {
                                                    e.preventDefault();
                                                    handleExecuteClick();
                                                }
                                            }}
                                            placeholder="输入您的问题..."
                                            autoSize={{minRows: 1, maxRows: 4}}
                                        />
                                        <ExecuteButton
                                            onClick={handleExecuteClick}
                                            disabled={loading || !inputValue}
                                            loading={loading}
                                        />
                                    </div>
                                </div>
                            </Form.Item>
                        </Form>
                    </div>
                </div>
            </div>

            <SettingsModal
                visible={settingsVisible}
                onClose={handleCloseSettings}
            />

            <Modal
                title="添加知识"
                open={showKnowledgeModal}
                onCancel={() => setShowKnowledgeModal(false)}
                onOk={handleAddKnowledgeSubmit}
                okText="添加"
                cancelText="取消"
            >
                <Form
                    form={knowledgeForm}
                    layout="vertical"
                    onFinish={handleAddKnowledge}
                >
                    <Form.Item
                        name="name"
                        label="知识名称"
                        rules={[
                            {required: true, message: '请输入知识名称'},
                            {
                                validator: (_, value) => {
                                    if (value && Object.keys(advancedKnowledge).includes(value)) {
                                        return Promise.reject('该知识名称已存在');
                                    }
                                    return Promise.resolve();
                                }
                            }
                        ]}
                    >
                        <Input placeholder="请输入知识名称"/>
                    </Form.Item>
                    <Form.Item
                        name="content"
                        label="知识内容"
                        rules={[{required: true, message: '请输入知识内容'}]}
                    >
                        <Input.TextArea
                            rows={4}
                            placeholder="请输入知识内容"
                        />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}


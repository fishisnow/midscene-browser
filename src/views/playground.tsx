import type {UIContext} from '@midscene/core';
import {overrideAIConfig} from '@midscene/core/env';
import {
    type PlaygroundResult,
    useEnvConfig,
} from '@midscene/visualizer';
import {Form, message, Button, Modal, Input, Radio, Typography} from 'antd';
import {SettingOutlined, GithubOutlined, BookOutlined, WarningOutlined, InfoCircleOutlined, ThunderboltOutlined, ArrowLeftOutlined, FileTextOutlined} from '@ant-design/icons';
import {useCallback, useEffect, useRef, useState} from 'react';
import {CompositeAgent, TaskPlan} from '../agent/composite-agent.ts';
import {TaskList, TaskWithStatus, TaskStatus} from './task-list.tsx';
import {KnowledgeCarousel} from './knowledge-carousel.tsx';
import {ExecuteButton} from './popup/components/execute-button.tsx';
import {RetryButton} from './popup/components/retry-button.tsx';
import { useTranslation } from 'react-i18next';
import { setLanguage } from '../locales/i18n';
import i18n from '../locales/i18n';

// Header组件定义
const Header = ({title, children}: { title: string, children?: React.ReactNode }) => {
    const { t } = useTranslation();
    return (
        <div className="header-nav">
            <div className="logo-container">
                <img src="/icons/icon.png" alt="Logo" className="midscene-logo"/>
                <span className="logo-text">{title || t('header.title')}</span>
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
    // 处理403错误
    if (errorMessage.includes('403 status code') || errorMessage.includes('failed to call AI model service: 403')) {
        return i18n.t('errors.apiConnectionError');
    }
    // 处理404错误
    if (errorMessage.includes('404') || errorMessage.includes('failed to call AI model service: 404')) {
        return i18n.t('errors.notFoundError');
    }
    if (errorMessage.includes('of different extension')) {
        return i18n.t('errors.conflictExtension');
    }
    if (!errorMessage?.includes(ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED)) {
        return errorMessage;
    }
    return i18n.t('errors.unknownError');
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

// 添加判断是否为API相关错误的函数
const isAPIRelatedError = (errorMessage?: string | null): boolean => {
    if (!errorMessage) return false;
    return (
        errorMessage.includes('API') || 
        errorMessage.includes('403') || 
        errorMessage.includes('404') ||
        errorMessage.includes('密钥') || 
        errorMessage.includes('无法连接') ||
        errorMessage.includes('model service') ||
        errorMessage.includes('failed to call AI model service')
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
    const [editingConfig, setEditingConfig] = useState(false);
    // 添加上一次任务指令记录
    const [lastPrompt, setLastPrompt] = useState('');

    // Form and environment configuration
    const [form] = Form.useForm();
    const [knowledgeForm] = Form.useForm();
    const inputRef = useRef<any>(null);
    const { Paragraph } = Typography;

    const {config, configString, loadConfig} = useEnvConfig();
    const [tempConfigString, setTempConfigString] = useState(configString);
    const forceSameTabNavigation = useEnvConfig(
        (state) => state.forceSameTabNavigation,
    );
    
    // 记录上次环境配置的状态
    const lastConfigRef = useRef(config);

    const curAgentRef = useRef<any>(null);
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
        // 如果有上一次的指令，填入输入框
        if (lastPrompt) {
            setInputValue(lastPrompt);
            form.setFieldsValue({ prompt: lastPrompt });
        }
        
        // 如果是规划阶段失败，先重置状态
        if (executionPhase === ExecutionPhase.ERROR && tasksWithStatus.length === 0) {
            resetPlanningState();
        }
        
        // 如果有上一次指令，则直接运行；否则走原逻辑
        if (lastPrompt) {
            // 延迟一点执行，确保输入框数据已更新
            setTimeout(() => {
                handleRun();
            }, 50);
        } else {
            handleRun();
        }
    };

    // 处理添加知识提交
    const handleAddKnowledgeSubmit = () => {
        knowledgeForm.submit();
    };

    // 处理添加知识
    const handleAddCustom = (values: { name: string; content: string }) => {
        // 检查名称是否已存在于系统知识或自定义知识中
        const isNameExist = Object.keys(advancedKnowledge).includes(values.name);
        if (isNameExist) {
            message.error(i18n.t('knowledge.nameExists'));
            return;
        }

        const newKnowledge = {
            ...advancedKnowledge,
            [values.name]: values.content
        };
        setAdvancedKnowledge(newKnowledge);
        setShowKnowledgeModal(false);
        message.success(i18n.t('knowledge.addSuccess', { name: values.name }));
    };

    // Handle form submission
    const handleRun = useCallback(async () => {
        const value = form.getFieldsValue();
        if (!value.prompt) {
            message.error(i18n.t('errors.promptRequired'));
            return;
        }

        // 记录当前的任务指令，以便重新运行时使用
        setLastPrompt(value.prompt);

        const startTime = Date.now();

        setLoading(true);
        setExecutionPhase(ExecutionPhase.PLANNING);
        setResult(null);
        setCurrentActivityIndex(-1);
        
        // 计算当前是否显示重试按钮，决定是否需要清空任务列表
        const isShowingRetryButton = (executionPhase === ExecutionPhase.COMPLETED || executionPhase === ExecutionPhase.ERROR || tasksWithStatus.some(t => t.status === TaskStatus.FAILED)) && !loading;
        
        // 不清空任务列表，当重新运行时需要重置
        if (!isShowingRetryButton) {
            setTasksWithStatus([]);
        }
        
        const result: PlaygroundResult = {...blankResult};

        const thisRunningId = Date.now();
        try {
            currentRunningIdRef.current = thisRunningId;
            interruptedFlagRef.current[thisRunningId] = false;

            const compositeAgent = new CompositeAgent();

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

            // 分两步执行：先规划，后执行
            try {
                try {
                    const activeAgent = getAgent();
                    curAgentRef.current = activeAgent
                    const plan = await compositeAgent.planTask(value.prompt, activeAgent, advancedKnowledge);
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
                    
                    // 如果是API相关错误，给用户提供更明确的引导
                    if (isAPIRelatedError(result.error)) {
                        message.error('AI服务连接失败，请检查API设置');
                    }
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
            // 销毁页面
            console.log("agent: ", curAgentRef.current);
            await curAgentRef.current?.page?.destroy();
            console.log('页面已销毁');
        } catch (e) {
            console.error('销毁页面时出错:', e);
        }

        curAgentRef.current = null;
        setResult(result);
        setLoading(false);

        // 修改此处，不再清空输入框内容，以便重新运行时可以看到上次的指令
        // 如果没有开始执行任务，就清空表单和输入框内容
        if (executionPhase !== ExecutionPhase.EXECUTING && executionPhase !== ExecutionPhase.COMPLETED) {
            // 只有在规划阶段失败时才清空，保留上次成功的指令
            if (executionPhase === ExecutionPhase.PLANNING && result.error) {
                // 在规划失败的情况下，不清空输入框，依然保留用户的输入
                // 注意：这里不调用form.resetFields()和setInputValue('')
            } else {
                // 其他情况下仍然执行原来的清空逻辑
                form.resetFields();
                setInputValue('');
            }
        }

        console.log(`执行时间: ${Date.now() - startTime}毫秒`);
    }, [form, getAgent, forceSameTabNavigation, advancedKnowledge, executionPhase, tasksWithStatus, loading]);

    // 添加重置规划状态的函数
    const resetPlanningState = () => {
        setExecutionPhase(ExecutionPhase.IDLE);
        setTasksWithStatus([]);
        setResult(null);
        setCurrentActivityIndex(-1);
        // 不要在此清空lastPrompt，保留上次的指令
    };

    // 处理重试操作
    const handleRetry = useCallback(() => {
        // 恢复上次的指令
        if (lastPrompt) {
            setInputValue(lastPrompt);
            form.setFieldsValue({ prompt: lastPrompt });
        }
        
        // 重新执行任务但保留错误状态
        if (result?.error) {
            if (tasksWithStatus.length > 0) {
                // 有任务列表时，清空错误状态但保留任务
                setTasksWithStatus(prevTasks => prevTasks.map(task => ({
                    ...task,
                    status: task.status === TaskStatus.FAILED ? TaskStatus.PENDING : task.status,
                    error: null
                })));
            } else {
                // 规划阶段失败，完全重置状态
                resetPlanningState();
            }
        }

        // 延迟一点执行，确保输入框数据已更新
        setTimeout(() => {
            // 重新执行任务
            handleRun();
        }, 50);
    }, [handleRun, result, tasksWithStatus.length, lastPrompt, form]);

    // 更新知识库配置
    const handleAdvancedKnowledgeChange = (value: Record<string, string>) => {
        setAdvancedKnowledge(value);
    };

    // 处理知识选择
    const handleKnowledgeSelected = (name: string) => {
        setSelectedKnowledge(name);
    };

    // 处理设置按钮点击 - 执行环境配置相关操作
    const handleOpenSettings = () => {
        // 保存当前配置状态
        lastConfigRef.current = config;
        setSettingsVisible(true);
        setTempConfigString(configString);
        setEditingConfig(false);
    };
    
    // 处理设置对话框关闭
    const handleCloseSettings = () => {
        setSettingsVisible(false);
    };

    // 处理设置保存
    const handleSaveSettings = () => {
        if (editingConfig) {
            loadConfig(tempConfigString);
            
            // 检查配置是否改变，如果改变了可能需要刷新页面
            if (JSON.stringify(lastConfigRef.current) !== JSON.stringify(config)) {
                console.log('配置已更改，刷新页面...');
                // 可能的话，这里还可以添加一个重新加载的提示
                message.success('环境配置已更新');
            }
        }
        setSettingsVisible(false);
        setEditingConfig(false);
    };

    // 将配置字符串转换为对象，以便显示键而隐藏值
    const getConfigObject = (configStr: string) => {
        const result: Record<string, string> = {};
        if (!configStr) return result;

        const lines = configStr.split('\n');
        for (const line of lines) {
            const trimLine = line.trim();
            if (!trimLine || trimLine.startsWith('#')) continue;
            
            const separator = trimLine.indexOf('=');
            if (separator > 0) {
                const key = trimLine.substring(0, separator).trim();
                if (key) {
                    result[key] = '***';
                }
            }
        }
        return result;
    };

    // 计算显示相关数据
    const completedTasks = tasksWithStatus.filter(t => t.isCompleted || t.status === TaskStatus.COMPLETED);
    const errorTasks = tasksWithStatus.filter(t => t.status === TaskStatus.FAILED);
    const hasErrors = errorTasks.length > 0;
    tasksWithStatus.length
        ? Math.round((completedTasks.length / tasksWithStatus.length) * 100)
        : 0;
    const showRetryButton = (executionPhase === ExecutionPhase.COMPLETED || executionPhase === ExecutionPhase.ERROR || hasErrors) && !loading;

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

    const { i18n } = useTranslation();

    return (
        <div className="playground-container">
            <Header title="Midscene Browser">
                <div className="header-actions">
                    <Button
                        type="text"
                        icon={<GithubOutlined/>}
                        onClick={() => window.open('https://github.com/fishisnow/midscene-browser', '_blank')}
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
                            <FileTextOutlined className="knowledge-icon"/>
                            <span>{i18n.t('knowledge.selectedKnowledge').replace('{name}', `"${selectedKnowledge}"`)}</span>
                        </div>
                    </div>
                )}

                <div className="conversation-area">
                    <div className="tasks-container">
                        {loading && executionPhase === ExecutionPhase.PLANNING && tasksWithStatus.length === 0 ? (
                            <div className="task-list-placeholder planning-stage">
                                <div className="planning-stage-icon">
                                    <ThunderboltOutlined style={{ fontSize: '20px', color: '#1890ff' }} />
                                </div>
                                <div className="planning-stage-title">{i18n.t('playground.taskPlanning')}</div>
                                <div className="planning-stage-description">
                                    <span className="icon-wrapper"><InfoCircleOutlined /></span>
                                    <div className="description-content">
                                        <div className="description-text">{i18n.t('playground.planningAnalysis')}</div>
                                        <div className="description-text">{i18n.t('playground.pleaseWait')}</div>
                                    </div>
                                </div>
                                <div className="task-planning-animation">
                                    <div className="task-planning-dot"></div>
                                    <div className="task-planning-dot"></div>
                                    <div className="task-planning-dot"></div>
                                </div>
                            </div>
                        ) : executionPhase === ExecutionPhase.ERROR && !loading && tasksWithStatus.length === 0 ? (
                            // 规划阶段错误显示
                            <div className="task-list-placeholder error-state">
                                <div className="error-icon">
                                    <span role="img" aria-label="error" className="anticon anticon-warning">
                                        <WarningOutlined style={{ fontSize: '28px', color: '#ff4d4f' }} />
                                    </span>
                                </div>
                                <div className="error-title">{i18n.t('playground.planningFailed')}</div>
                                <div className="error-message">{result?.error || i18n.t('errors.unknownError')}</div>
                                <div className="error-actions">
                                    {isAPIRelatedError(result?.error) && (
                                        <Button 
                                            type="primary" 
                                            onClick={handleOpenSettings}
                                            icon={<SettingOutlined />}
                                            style={{ marginRight: '8px' }}
                                        >
                                            {i18n.t('playground.apiSettings')}
                                        </Button>
                                    )}
                                    <Button 
                                        onClick={handleRerunClick}
                                        style={{ margin: '0 8px' }}
                                    >
                                        {i18n.t('common.retry')}
                                    </Button>
                                    {/* 只有当不是API相关错误时才显示返回按钮 */}
                                    {!isAPIRelatedError(result?.error) && (
                                        <Button 
                                            onClick={resetPlanningState}
                                            icon={<ArrowLeftOutlined />}
                                        >
                                            {i18n.t('common.back')}
                                        </Button>
                                    )}
                                </div>
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
                                <div className="empty-text">{i18n.t('playground.emptyPrompt')}</div>
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
                        <div className="footer-actions-container" style={{ marginBottom: '24px' }}>
                            <div className="retry-button-wrapper">
                                <RetryButton
                                    onClick={handleRerunClick}
                                    text={i18n.t('common.runAgain')}
                                    className="action-button"
                                />
                            </div>
                            
                            <div className="return-button-wrapper">
                                <Button 
                                    type="primary" 
                                    onClick={resetPlanningState}
                                    icon={<ArrowLeftOutlined />}
                                    className="action-button"
                                >
                                    {i18n.t('common.backToHome')}
                                </Button>
                            </div>
                        </div>
                    )}

                    {!showRetryButton && !loading && (executionPhase === ExecutionPhase.COMPLETED || executionPhase === ExecutionPhase.ERROR) && (
                        <div className="footer-actions-container" style={{ marginBottom: '24px' }}>
                            <div className="return-button-wrapper">
                                <Button 
                                    type="primary" 
                                    onClick={resetPlanningState}
                                    icon={<ArrowLeftOutlined />}
                                    className="action-button"
                                >
                                    {i18n.t('common.backToHome')}
                                </Button>
                            </div>
                        </div>
                    )}

                    <div className="input-wrapper">
                        {loading && (
                            <div className="footer-loading-indicator"></div>
                        )}
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
                                            placeholder={i18n.t('playground.inputPlaceholder')}
                                            autoSize={{minRows: 1, maxRows: 4}}
                                            disabled={loading}
                                            style={{width: '100%', boxSizing: 'border-box'}}
                                        />
                                        <ExecuteButton
                                            onClick={handleExecuteClick}
                                            disabled={loading || !inputValue}
                                            loading={loading}
                                            className="send-button execute-button"
                                        />
                                    </div>
                                </div>
                            </Form.Item>
                        </Form>
                    </div>
                </div>
            </div>

            <Modal
                title={i18n.t('settings.title')}
                open={settingsVisible}
                onCancel={handleCloseSettings}
                footer={[
                    <Button key="cancel" onClick={handleCloseSettings}>
                        {i18n.t('common.cancel')}
                    </Button>,
                    <Button key="save" type="primary" onClick={handleSaveSettings} disabled={!editingConfig}>
                        {i18n.t('common.save')}
                    </Button>
                ]}
                destroyOnClose={true}
                maskClosable={true}
                centered={true}
                className="settings-modal"
                width={700}
            >
                {editingConfig ? (
                    <>
                        <Input.TextArea
                            rows={10}
                            placeholder={'OPENAI_API_KEY=sk-...\nMIDSCENE_MODEL_NAME=gpt-4o-2024-08-06\n...'}
                            value={tempConfigString}
                            onChange={(e) => setTempConfigString(e.target.value)}
                            style={{ whiteSpace: 'nowrap', wordWrap: 'break-word' }}
                        />
                        <div style={{ marginTop: '10px', textAlign: 'right' }}>
                            <Button onClick={() => setEditingConfig(false)}>
                                {i18n.t('settings.cancelEdit')}
                            </Button>
                        </div>
                    </>
                ) : (
                    <div className="masked-config-container">
                        <div style={{ marginBottom: '15px' }}>
                            <Button 
                                type="primary" 
                                onClick={() => setEditingConfig(true)}
                                icon={<SettingOutlined />}
                            >
                                {i18n.t('settings.editConfig')}
                            </Button>
                        </div>
                        
                        <div style={{ marginBottom: '15px' }}>
                            <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>{i18n.t('settings.language')}</div>
                            <Radio.Group 
                                value={i18n.language} 
                                onChange={(e) => setLanguage(e.target.value)}
                            >
                                <Radio.Button value="zh">{i18n.t('settings.langZh')}</Radio.Button>
                                <Radio.Button value="en">{i18n.t('settings.langEn')}</Radio.Button>
                            </Radio.Group>
                        </div>
                        
                        <div className="masked-config-list" style={{ 
                            border: '1px solid #f0f0f0', 
                            borderRadius: '4px', 
                            padding: '10px', 
                            maxHeight: '300px', 
                            overflowY: 'auto' 
                        }}>
                            {Object.entries(getConfigObject(tempConfigString)).map(([key, _]) => (
                                <div key={key} className="config-item" style={{ 
                                    display: 'flex', 
                                    justifyContent: 'space-between', 
                                    padding: '8px 4px',
                                    borderBottom: '1px solid #f0f0f0'
                                }}>
                                    <span className="config-key" style={{ fontWeight: 'bold' }}>{key}</span>
                                    <span className="config-value" style={{ color: '#999' }}>***</span>
                                </div>
                            ))}
                        </div>
                        {Object.keys(getConfigObject(tempConfigString)).length === 0 && (
                            <div className="no-config" style={{ 
                                textAlign: 'center', 
                                padding: '20px', 
                                color: '#999',
                                border: '1px dashed #d9d9d9',
                                borderRadius: '4px'
                            }}>
                                <p>{i18n.t('knowledge.noKnowledge')}</p>
                            </div>
                        )}
                    </div>
                )}
                <div className="env-config-description" style={{ marginTop: '15px' }}>
                    <p>{i18n.t('settings.format')}</p>
                    <p>{i18n.t('settings.localStorageNotice')}</p>
                    <p>{i18n.t('settings.commonConfigs')}</p>
                    <ul>
                        <li>{i18n.t('settings.apiKey')}</li>
                        <li>{i18n.t('settings.baseUrl')}</li>
                        <li>{i18n.t('settings.modelName')}</li>
                    </ul>
                </div>
            </Modal>

            <Modal
                title={i18n.t('knowledge.addKnowledge')}
                open={showKnowledgeModal}
                onCancel={() => setShowKnowledgeModal(false)}
                onOk={handleAddKnowledgeSubmit}
                okText={i18n.t('common.add')}
                cancelText={i18n.t('common.cancel')}
            >
                <Form
                    form={knowledgeForm}
                    layout="vertical"
                    onFinish={handleAddCustom}
                >
                    <Paragraph type="secondary" style={{marginBottom: 12, fontSize: 12}}>
                        {i18n.t('knowledge.addHelp')}
                    </Paragraph>

                    <Form.Item
                        name="name"
                        label={i18n.t('knowledge.name')}
                        rules={[
                            {required: true, message: i18n.t('knowledge.name')},
                            {
                                validator: (_, value) => {
                                    const isNameExist = Object.keys(advancedKnowledge).includes(value);
                                    return isNameExist
                                        ? Promise.reject(new Error(i18n.t('knowledge.nameExists')))
                                        : Promise.resolve();
                                }
                            }
                        ]}
                    >
                        <Input placeholder={i18n.t('knowledge.namePlaceholder')}/>
                    </Form.Item>
                    <Form.Item
                        name="content"
                        label={i18n.t('knowledge.content')}
                        rules={[{required: true, message: i18n.t('knowledge.contentPlaceholder')}]}
                    >
                        <Input.TextArea
                            rows={3}
                            placeholder={i18n.t('knowledge.contentPlaceholder')}
                        />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}


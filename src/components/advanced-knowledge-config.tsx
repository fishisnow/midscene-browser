import {Form, Input, Card, Button, Space, Modal, Radio, Tooltip, Typography, Empty, Divider} from 'antd';
import {useState, useEffect} from 'react';
import {PlusOutlined, DeleteOutlined, QuestionCircleOutlined} from '@ant-design/icons';
import systemKnowledgeData from '../config/system-knowledge.json';
import {RadioChangeEvent} from 'antd/es/radio';

const {Text, Paragraph} = Typography;

type KnowledgeItem = {
    name: string;
    content: string;
    isCustom?: boolean;
};

export interface AdvancedKnowledgeConfigProps {
    value?: Record<string, string>;
    onChange?: (value: Record<string, string>) => void;
    onSelected?: (name: string) => void;
    selectedKnowledge?: string | null;
}

// 从配置文件加载系统内置的知识库
const systemKnowledge: KnowledgeItem[] = systemKnowledgeData.systemKnowledge || [];

// 本地存储键名
const STORAGE_KEY = 'midscene_custom_knowledge';

export function AdvancedKnowledgeConfig({
                                            onChange,
                                            onSelected,
                                            selectedKnowledge: externalSelectedKnowledge
                                        }: AdvancedKnowledgeConfigProps) {
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [selectedKnowledgeLocal, setSelectedKnowledgeLocal] = useState<string>('');
    const [customKnowledge, setCustomKnowledge] = useState<KnowledgeItem[]>([]);
    const [form] = Form.useForm();

    // 初始化知识库
    useEffect(() => {
        // 从localStorage加载自定义知识
        try {
            const savedCustomKnowledge = localStorage.getItem(STORAGE_KEY);
            if (savedCustomKnowledge) {
                setCustomKnowledge(JSON.parse(savedCustomKnowledge));
            }
        } catch (e) {
            console.error('加载自定义知识失败', e);
        }

        // 如果外部已有选择的知识，则同步状态
        if (externalSelectedKnowledge) {
            setSelectedKnowledgeLocal(externalSelectedKnowledge);
        }
    }, []);

    // 同步外部selectedKnowledge变化
    useEffect(() => {
        if (externalSelectedKnowledge !== undefined && externalSelectedKnowledge !== null) {
            setSelectedKnowledgeLocal(externalSelectedKnowledge);
        }
    }, [externalSelectedKnowledge]);

    // 更新知识库时触发onChange
    useEffect(() => {
        if (onChange && selectedKnowledgeLocal) {
            const allKnowledge = [...systemKnowledge, ...customKnowledge];
            const selected = allKnowledge.find(item => item.name === selectedKnowledgeLocal);

            if (selected) {
                onChange({
                    [selected.name]: selected.content
                });
            }
        }
    }, [selectedKnowledgeLocal, customKnowledge, onChange]);

    // 添加自定义知识
    const handleAddCustom = (values: { name: string; content: string }) => {
        const newItem: KnowledgeItem = {
            name: values.name,
            content: values.content,
            isCustom: true
        };

        const updatedCustomKnowledge = [...customKnowledge, newItem];
        setCustomKnowledge(updatedCustomKnowledge);

        // 保存到localStorage
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedCustomKnowledge));

        // 选中新添加的知识
        setSelectedKnowledgeLocal(newItem.name);
        if (onSelected) {
            onSelected(newItem.name);
        }

        form.resetFields();
        setIsModalVisible(false);
    };

    // 删除自定义知识
    const handleDeleteCustom = (name: string) => {
        const updatedCustomKnowledge = customKnowledge.filter(item => item.name !== name);
        setCustomKnowledge(updatedCustomKnowledge);

        // 保存到localStorage
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedCustomKnowledge));

        // 如果删除的是当前选中的知识，则清空选择
        if (selectedKnowledgeLocal === name) {
            setSelectedKnowledgeLocal('');
            if (onSelected) {
                onSelected('');
            }
            if (onChange) {
                onChange({});
            }
        }
    };

    // 显示添加模态框
    const showAddModal = () => {
        form.resetFields();
        setIsModalVisible(true);
    };

    // 处理知识选择变化
    const handleKnowledgeChange = (e: RadioChangeEvent) => {
        const selectedName = e.target.value;
        setSelectedKnowledgeLocal(selectedName);
        if (onSelected) {
            onSelected(selectedName);
        }
    };

    // 计算实际使用的选中值
    const effectiveSelectedValue = selectedKnowledgeLocal || externalSelectedKnowledge || '';

    // 获取所有知识条目
    const allKnowledgeItems = [...systemKnowledge, ...customKnowledge];

    // 是否有系统知识
    const hasSystemKnowledge = systemKnowledge.length > 0;

    // 是否有自定义知识
    const hasCustomKnowledge = customKnowledge.length > 0;

    return (
        <div className="advanced-knowledge-config">
            <Card
                title="高级知识库配置"
                extra={
                    <Button
                        type="primary"
                        icon={<PlusOutlined/>}
                        onClick={showAddModal}
                        size="small"
                        className="add-knowledge-btn"
                    >
                        自定义添加
                    </Button>
                }
                size="small"
            >
                {allKnowledgeItems.length > 0 ? (
                    <Radio.Group
                        onChange={handleKnowledgeChange}
                        value={effectiveSelectedValue}
                        style={{width: '100%'}}
                    >
                        <Space direction="vertical" style={{width: '100%'}}>
                            {/* 系统知识标题 */}
                            {hasSystemKnowledge && (
                                <div className="knowledge-type-title">系统内置知识库</div>
                            )}

                            {/* 系统知识选项 */}
                            {systemKnowledge.map((item) => (
                                <Tooltip
                                    key={item.name}
                                    title={item.content}
                                    placement="right"
                                    color="#f0f0f0"
                                    overlayInnerStyle={{color: 'rgba(0, 0, 0, 0.85)', maxWidth: 300}}
                                >
                                    <Radio value={item.name}
                                           style={{width: '100%', display: 'flex', alignItems: 'center'}}>
                                        <Text ellipsis style={{maxWidth: '90%'}}>{item.name}</Text>
                                        <QuestionCircleOutlined className="question-icon"/>
                                    </Radio>
                                </Tooltip>
                            ))}

                            {/* 自定义知识标题 */}
                            {hasCustomKnowledge && (
                                <div className="knowledge-type-title">
                                    {hasSystemKnowledge && <Divider style={{margin: '12px 0'}}/>}
                                    我的自定义知识库
                                </div>
                            )}

                            {/* 自定义知识选项 */}
                            {customKnowledge.map((item) => (
                                <div key={item.name}
                                     style={{display: 'flex', justifyContent: 'space-between', width: '100%'}}>
                                    <Tooltip
                                        title={item.content}
                                        placement="right"
                                        color="#f0f0f0"
                                        overlayInnerStyle={{color: 'rgba(0, 0, 0, 0.85)', maxWidth: 300}}
                                    >
                                        <Radio value={item.name}
                                               style={{maxWidth: '85%', display: 'flex', alignItems: 'center'}}>
                                            <Text ellipsis style={{maxWidth: '90%'}} className="knowledge-item-custom">
                                                {item.name}
                                            </Text>
                                            <QuestionCircleOutlined className="question-icon"/>
                                        </Radio>
                                    </Tooltip>
                                    <Button
                                        type="text"
                                        danger
                                        icon={<DeleteOutlined/>}
                                        onClick={() => handleDeleteCustom(item.name)}
                                        size="small"
                                        className="delete-knowledge-btn"
                                        style={{marginLeft: 'auto'}}
                                    />
                                </div>
                            ))}
                        </Space>
                    </Radio.Group>
                ) : (
                    <Empty
                        description={
                            <span>
                暂无可用知识库
                <br/>
                <Button type="link" onClick={showAddModal}>
                  点击添加自定义知识
                </Button>
              </span>
                        }
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                    />
                )}
            </Card>

            {/* 自定义知识添加模态框 */}
            <Modal
                title="添加自定义知识"
                open={isModalVisible}
                onCancel={() => setIsModalVisible(false)}
                onOk={() => form.submit()}
                destroyOnClose
                className="knowledge-modal"
                width={550}
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleAddCustom}
                >
                    <Paragraph type="secondary" style={{marginBottom: 20}}>
                        添加自定义知识库可以帮助AI更好地理解和处理特定类型的网站，提高自动化任务的准确性。
                    </Paragraph>

                    <Form.Item
                        name="name"
                        label="知识名称"
                        rules={[
                            {required: true, message: '请输入知识名称'},
                            {
                                validator: (_, value) => {
                                    const allNames = [...systemKnowledge, ...customKnowledge].map(item => item.name);
                                    return allNames.includes(value)
                                        ? Promise.reject(new Error('知识名称已存在'))
                                        : Promise.resolve();
                                }
                            }
                        ]}
                    >
                        <Input placeholder="例如: 企业内部系统"/>
                    </Form.Item>
                    <Form.Item
                        name="content"
                        label="知识内容"
                        rules={[{required: true, message: '请输入知识内容'}]}
                        extra="详细描述此类型网站的功能、结构和常见操作，帮助AI更好地理解"
                    >
                        <Input.TextArea
                            rows={5}
                            placeholder="请输入对该知识的详细描述"
                        />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
} 
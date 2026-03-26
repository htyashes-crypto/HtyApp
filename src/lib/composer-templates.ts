export interface SkillTemplate {
  id: string;
  nameZh: string;
  nameEn: string;
  descriptionZh: string;
  descriptionEn: string;
  files: Array<{ fileName: string; content: string }>;
}

export const SKILL_TEMPLATES: SkillTemplate[] = [
  {
    id: "code-review",
    nameZh: "代码审查",
    nameEn: "Code Review",
    descriptionZh: "审查代码质量、风格和潜在 Bug",
    descriptionEn: "Review code quality, style and potential bugs",
    files: [{
      fileName: "SKILL.md",
      content: `---
name: code-review
description: 代码审查技能，检查代码质量、风格一致性和潜在 Bug。
---

# 代码审查

## 审查要点

- **正确性**: 逻辑是否有误，边界条件是否处理
- **可读性**: 命名是否清晰，结构是否合理
- **性能**: 是否有不必要的计算或内存分配
- **安全性**: 是否有注入、越权等安全隐患
- **一致性**: 是否遵循项目现有的代码风格

## 输出格式

对每个问题给出：
1. 问题位置（文件名 + 行号）
2. 问题描述
3. 建议修复方式
`
    }]
  },
  {
    id: "test-generation",
    nameZh: "测试生成",
    nameEn: "Test Generation",
    descriptionZh: "根据代码自动生成单元测试",
    descriptionEn: "Auto-generate unit tests from code",
    files: [{
      fileName: "SKILL.md",
      content: `---
name: test-generation
description: 根据代码自动生成单元测试，覆盖正常路径和边界情况。
---

# 测试生成

## 规则

- 为每个公开方法生成至少一个测试用例
- 覆盖正常输入、边界值和异常输入
- 使用项目已有的测试框架和断言库
- 测试命名格式：\`should_行为_when_条件\`
- Mock 外部依赖，专注测试目标函数逻辑

## 输出格式

\`\`\`typescript
describe("函数名", () => {
  it("should ... when ...", () => {
    // Arrange
    // Act
    // Assert
  });
});
\`\`\`
`
    }]
  },
  {
    id: "documentation",
    nameZh: "文档编写",
    nameEn: "Documentation",
    descriptionZh: "为函数和 API 生成文档",
    descriptionEn: "Generate documentation for functions and APIs",
    files: [{
      fileName: "SKILL.md",
      content: `---
name: documentation
description: 为代码生成清晰的文档，包含参数说明、返回值和示例。
---

# 文档编写

## 规则

- 用中文编写文档
- 包含函数用途、参数说明、返回值类型
- 给出至少一个使用示例
- 说明可能抛出的异常
- 标注关键的副作用

## 文档模板

\`\`\`
/**
 * 函数说明
 * @param name - 参数说明
 * @returns 返回值说明
 * @throws 异常说明
 * @example
 * const result = myFunction("input");
 */
\`\`\`
`
    }]
  },
  {
    id: "refactoring",
    nameZh: "重构建议",
    nameEn: "Refactoring",
    descriptionZh: "分析代码并提供重构改进建议",
    descriptionEn: "Analyze code and suggest refactoring improvements",
    files: [{
      fileName: "SKILL.md",
      content: `---
name: refactoring
description: 分析代码结构并提供重构建议，提升可维护性和可读性。
---

# 重构建议

## 关注方向

- **消除重复**: 提取公共函数或组件
- **简化复杂度**: 拆分过长的函数，降低嵌套层级
- **明确职责**: 每个模块/类只负责一件事
- **改善命名**: 让代码自解释
- **优化依赖**: 减少不必要的耦合

## 输出格式

对每条建议说明：
1. 当前问题
2. 建议的重构方式
3. 重构后的预期效果
`
    }]
  },
  {
    id: "code-explanation",
    nameZh: "代码解释",
    nameEn: "Code Explanation",
    descriptionZh: "用通俗语言解释复杂代码逻辑",
    descriptionEn: "Explain complex code logic in plain language",
    files: [{
      fileName: "SKILL.md",
      content: `---
name: code-explanation
description: 用通俗易懂的语言解释代码逻辑，帮助理解复杂实现。
---

# 代码解释

## 规则

- 用中文解释
- 从整体到细节，先说"这段代码做什么"，再说"怎么做的"
- 用类比帮助理解抽象概念
- 标注关键的设计决策和权衡
- 如果代码有问题，指出并建议改进
`
    }]
  },
  {
    id: "performance",
    nameZh: "性能优化",
    nameEn: "Performance",
    descriptionZh: "识别性能瓶颈并提供优化方案",
    descriptionEn: "Identify performance bottlenecks and optimization strategies",
    files: [{
      fileName: "SKILL.md",
      content: `---
name: performance
description: 分析代码性能瓶颈，提供具体的优化方案。
---

# 性能优化

## 检查项

- **算法复杂度**: 是否有 O(n²) 可以优化为 O(n)
- **内存**: 是否有内存泄漏或不必要的大对象
- **I/O**: 是否有可以合并或缓存的网络/磁盘操作
- **渲染**: 是否有不必要的重渲染或重排
- **并发**: 是否有可以并行化的顺序操作

## 输出格式

对每个优化点：
1. 当前瓶颈描述
2. 影响程度（高/中/低）
3. 优化方案和预期提升
`
    }]
  },
  {
    id: "security-audit",
    nameZh: "安全审计",
    nameEn: "Security Audit",
    descriptionZh: "审查代码中的安全漏洞",
    descriptionEn: "Review code for security vulnerabilities",
    files: [{
      fileName: "SKILL.md",
      content: `---
name: security-audit
description: 检查代码中的安全漏洞，包括注入、越权、数据泄露等。
---

# 安全审计

## 检查项

- **注入攻击**: SQL 注入、命令注入、XSS
- **认证授权**: 权限校验是否完整
- **数据保护**: 敏感数据是否加密、日志是否泄露
- **依赖安全**: 是否使用了有已知漏洞的依赖
- **配置安全**: 是否有硬编码的密钥或凭据

## 严重等级

- **严重**: 可直接被利用，立即修复
- **高**: 特定条件下可利用，尽快修复
- **中**: 潜在风险，规划修复
- **低**: 最佳实践建议
`
    }]
  },
  {
    id: "blank",
    nameZh: "空白模板",
    nameEn: "Blank",
    descriptionZh: "从零开始创建自定义技能",
    descriptionEn: "Start from scratch with a custom skill",
    files: [{
      fileName: "SKILL.md",
      content: `---
name: my-skill
description: 在此输入技能描述
---

# 技能标题

在此编写技能内容。
`
    }]
  }
];

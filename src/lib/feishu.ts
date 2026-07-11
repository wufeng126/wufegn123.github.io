/**
 * 飞书消息推送工具
 * 支持通过 Webhook 地址向飞书群/用户发送消息
 */

interface FeishuTextMessage {
  msg_type: "text";
  content: {
    text: string;
  };
}

interface FeishuRichTextMessage {
  msg_type: "post";
  content: {
    post: {
      zh_cn: {
        title: string;
        content: Array<Array<{
          tag: string;
          text?: string;
          href?: string;
        }>>;
      };
    };
  };
}

interface FeishuResponse {
  code: number;
  msg: string;
}

/**
 * 发送飞书文本消息
 * @param webhookUrl 飞书机器人 Webhook 地址
 * @param content 消息内容
 * @returns 发送结果
 */
export async function sendFeishuTextMessage(
  webhookUrl: string,
  content: string
): Promise<{ success: boolean; message: string }> {
  if (!webhookUrl) {
    return { success: false, message: "未配置飞书 Webhook 地址" };
  }

  try {
    const message: FeishuTextMessage = {
      msg_type: "text",
      content: {
        text: content,
      },
    };

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    const result: FeishuResponse = await response.json();

    if (result.code === 0) {
      return { success: true, message: "消息发送成功" };
    } else {
      return { success: false, message: `发送失败: ${result.msg}` };
    }
  } catch (error) {
    console.error("发送飞书消息失败:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "网络请求失败",
    };
  }
}

/**
 * 发送飞书富文本消息（支持多行和链接）
 * @param webhookUrl 飞书机器人 Webhook 地址
 * @param title 标题
 * @param contentArr 内容数组，每项是一行，支持文字和链接
 * @returns 发送结果
 */
export async function sendFeishuRichTextMessage(
  webhookUrl: string,
  title: string,
  contentArr: Array<{ text?: string; href?: string }[]>
): Promise<{ success: boolean; message: string }> {
  if (!webhookUrl) {
    return { success: false, message: "未配置飞书 Webhook 地址" };
  }

  try {
    const message: FeishuRichTextMessage = {
      msg_type: "post",
      content: {
        post: {
          zh_cn: {
            title: title,
            content: contentArr.map((row) =>
              row.map((item) => {
                if (item.href) {
                  return {
                    tag: "a",
                    text: item.text || item.href,
                    href: item.href,
                  };
                } else {
                  return {
                    tag: "text",
                    text: item.text || "",
                  };
                }
              })
            ),
          },
        },
      },
    };

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    const result: FeishuResponse = await response.json();

    if (result.code === 0) {
      return { success: true, message: "消息发送成功" };
    } else {
      return { success: false, message: `发送失败: ${result.msg}` };
    }
  } catch (error) {
    console.error("发送飞书富文本消息失败:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "网络请求失败",
    };
  }
}

/**
 * 发送通知到飞书（通用方法）
 * @param webhookUrl 飞书 Webhook 地址
 * @param title 通知标题
 * @param message 通知内容
 * @param extraInfo 额外信息（如链接等）
 */
export async function sendFeishuNotification(
  webhookUrl: string,
  title: string,
  message: string,
  extraInfo?: { label: string; value: string; href?: string }[]
): Promise<{ success: boolean; message: string }> {
  if (!webhookUrl) {
    return { success: false, message: "未配置飞书 Webhook 地址" };
  }

  const contentArr: Array<{ text?: string; href?: string }[]> = [
    [{ text: message }],
  ];

  if (extraInfo && extraInfo.length > 0) {
    contentArr.push(
      ...extraInfo.map((item) => {
        if (item.href) {
          return [{ text: `${item.label}: ` }, { text: item.value, href: item.href }];
        } else {
          return [{ text: `${item.label}: ${item.value}` }];
        }
      })
    );
  }

  return sendFeishuRichTextMessage(webhookUrl, title, contentArr);
}

/**
 * 发送签证到期提醒
 */
export async function sendVisaExpiryReminder(
  webhookUrl: string,
  projectName: string,
  visaType: string,
  expiryDate: string,
  projectManager: string
): Promise<{ success: boolean; message: string }> {
  return sendFeishuNotification(
    webhookUrl,
    "签证到期提醒",
    `您有签证即将到期，请及时办理续期或结算！`,
    [
      { label: "项目名称", value: projectName },
      { label: "签证类型", value: visaType },
      { label: "到期日期", value: expiryDate },
      { label: "项目负责人", value: projectManager },
    ]
  );
}

/**
 * 发送结算单提醒
 */
export async function sendSettlementReminder(
  webhookUrl: string,
  contractNo: string,
  settlementNo: string,
  amount: string,
  settlementType: string,
  submitter: string
): Promise<{ success: boolean; message: string }> {
  return sendFeishuNotification(
    webhookUrl,
    "结算单待审核提醒",
    `有新的结算单需要审核，请及时处理！`,
    [
      { label: "合同编号", value: contractNo },
      { label: "结算单号", value: settlementNo },
      { label: "结算金额", value: amount },
      { label: "结算类型", value: settlementType },
      { label: "提交人", value: submitter },
    ]
  );
}

/**
 * 发送应付款预警
 */
export async function sendPaymentWarning(
  webhookUrl: string,
  contractNo: string,
  supplierName: string,
  pendingAmount: string,
  dueDate?: string
): Promise<{ success: boolean; message: string }> {
  const extraInfo = [
    { label: "合同编号", value: contractNo },
    { label: "供应商", value: supplierName },
    { label: "待付金额", value: pendingAmount },
  ];

  if (dueDate) {
    extraInfo.push({ label: "应付款日期", value: dueDate });
  }

  return sendFeishuNotification(
    webhookUrl,
    "应付款预警",
    dueDate ? "有应付款即将到期，请及时安排付款！" : "有超期欠款未付，请及时处理！",
    extraInfo
  );
}

/**
 * 发送成本超支预警
 */
export async function sendCostWarning(
  webhookUrl: string,
  projectName: string,
  workItemName: string,
  budgetAmount: string,
  actualAmount: string,
  overAmount: string
): Promise<{ success: boolean; message: string }> {
  return sendFeishuNotification(
    webhookUrl,
    "成本超支预警",
    `项目成本超出预算，请关注！`,
    [
      { label: "项目名称", value: projectName },
      { label: "分项工程", value: workItemName },
      { label: "预算金额", value: budgetAmount },
      { label: "实际金额", value: actualAmount },
      { label: "超支金额", value: overAmount },
    ]
  );
}

/**
 * 发送新增记录通知
 */
export async function sendNewRecordNotification(
  webhookUrl: string,
  recordType: string,
  projectName: string,
  content: string,
  creator: string
): Promise<{ success: boolean; message: string }> {
  return sendFeishuNotification(
    webhookUrl,
    `新增${recordType}提醒`,
    `有新的${recordType}记录，请知悉！`,
    [
      { label: "项目名称", value: projectName },
      { label: "内容摘要", value: content },
      { label: "创建人", value: creator },
    ]
  );
}

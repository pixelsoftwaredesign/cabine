const Rule = require('../models/Rule');
const { publishCommand } = require('./mqttService');

const evaluateRule = (rule, telemetry) => {
  const value = telemetry[rule.condition.field];
  if (value === undefined || value === null) return null;

  const t = Number(value);
  const threshold = Number(rule.condition.threshold);

  switch (rule.condition.operator) {
    case '>': return t > threshold;
    case '<': return t < threshold;
    case '>=': return t >= threshold;
    case '<=': return t <= threshold;
    case '=': return t === threshold;
    case '!=': return t !== threshold;
    default: return null;
  }
};

const evaluateRulesForCabin = async ({ cabinSerial, cabinId, telemetry }) => {
  const rules = await Rule.find({ enabled: true, $or: [{ cabinId }, { cabinId: null }] });

  for (const rule of rules) {
    const triggered = evaluateRule(rule, telemetry);
    if (triggered === null) continue;

    if (triggered) {
      publishCommand(cabinSerial, rule.action.device, {
        action: 'SET',
        value: rule.action.value
      });
      console.log(`[Automation] Règle "${rule.name}" déclenchée → ${rule.action.device}=${rule.action.value}`);
    } else if (rule.resetAction && rule.resetAction.device) {
      publishCommand(cabinSerial, rule.resetAction.device, {
        action: 'SET',
        value: rule.resetAction.value
      });
    }
  }
};

module.exports = { evaluateRulesForCabin, evaluateRule };
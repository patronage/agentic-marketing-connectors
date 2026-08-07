export interface PartialFailureDetail {
  fieldPath: string | null;
  message: string;
  operationIndex: number | null;
  trigger: string | null;
}

export function decodePartialFailureError(
  error: unknown
): PartialFailureDetail[] {
  const root = record(error);
  const details = array(root.details);
  const errors = details.flatMap((detail) => array(record(detail).errors));
  if (!errors.length && typeof root.message === "string") {
    return [
      {
        fieldPath: null,
        message: root.message,
        operationIndex: null,
        trigger: null,
      },
    ];
  }
  return errors.map((entry) => {
    const value = record(entry);
    const location = record(value.location);
    const elements = array(
      location.fieldPathElements ?? location.field_path_elements
    ).map(record);
    const operation = elements.find(
      (element) =>
        (element.fieldName ?? element.field_name) === "operations" ||
        (element.fieldName ?? element.field_name) === "mutate_operations"
    );
    return {
      fieldPath:
        elements
          .flatMap((element) => {
            const fieldName = String(
              element.fieldName ?? element.field_name ?? ""
            );
            return fieldName ? [fieldName] : [];
          })
          .join(".") || null,
      message: String(
        value.message ?? root.message ?? "Google Ads operation failed"
      ),
      operationIndex: integer(operation?.index),
      trigger: decodeProtoValue(value.trigger),
    };
  });
}
function decodeProtoValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "object") {
    return String(value);
  }
  const proto = record(value);
  for (const key of [
    "stringValue",
    "int64Value",
    "doubleValue",
    "boolValue",
    "string_value",
    "int64_value",
    "double_value",
    "bool_value",
  ]) {
    if (proto[key] !== null && proto[key] !== undefined) {
      return String(proto[key]);
    }
  }
  return JSON.stringify(proto);
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function integer(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

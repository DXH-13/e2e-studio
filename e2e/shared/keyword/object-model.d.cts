import type { MatchCondition, ObjectProperty, RoleLocator, SelectionMethod, TestObject } from './types';

export interface LocatorCandidate {
  kind: SelectionMethod;
  /** xpath:attributes, xpath:neighbor… với XPath; tên phương thức với loại khác. */
  label: string;
  value: string | ObjectProperty[] | RoleLocator;
}

export const METHODS: SelectionMethod[];
export const METHOD_LABELS: Record<SelectionMethod, string>;
export const CONDITIONS: MatchCondition[];
export const CONDITION_LABELS: Record<MatchCondition, string>;
export const ROLE_CONDITIONS: MatchCondition[];
export const PROPERTY_NAMES: string[];
export const XPATH_TYPES: string[];
export const ROLES: string[];
export function xpathLiteral(value: string): string;
export function normalizeObject(raw: unknown): TestObject;
export function candidates(obj: unknown): LocatorCandidate[];
export function summary(obj: unknown): string;
export function attributesSelector(rows: ObjectProperty[]): string;
export function attributesXPath(rows: ObjectProperty[]): string;
export function validateObject(obj: unknown): string[];
export function signatures(obj: unknown): string[];
export function createAttrsEngine(): {
  query(root: ParentNode, selector: string): Element | null;
  queryAll(root: ParentNode, selector: string): Element[];
};

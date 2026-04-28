import { cookies } from "next/headers";
import { isLanguage, LANGUAGE_COOKIE, translate, type Language, type MessageKey, type TFunction } from "./i18n";

// 서버 컴포넌트 전용 — cookie 에서 언어를 읽어 SSR 시점에 즉시 적용한다.
export async function getServerLanguage(): Promise<Language> {
  const store = await cookies();
  const v = store.get(LANGUAGE_COOKIE)?.value;
  return isLanguage(v) ? v : "en";
}

export async function getServerT(): Promise<TFunction> {
  const lang = await getServerLanguage();
  return (key: MessageKey, vars) => translate(lang, key, vars);
}

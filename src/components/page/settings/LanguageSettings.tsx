import { For } from "solid-js";
import { Languages } from "lucide-solid";
import settingsStore from "../../../stores/settings";
import { useI18n, availableLanguages } from "../../../i18n";
import Card from "../../common/Card";

function LanguageSettings() {
    const { settings, setLanguage } = settingsStore;
    const { t, setLanguage: setI18nLanguage } = useI18n();

    const handleChange = (lang: string) => {
        setLanguage(lang);
        setI18nLanguage(lang);
    };

    return (
        <Card
            title={t("settings.language.title")}
            icon={Languages}
            description={t("settings.language.description")}
            headerAction={
                <select
                    class="select select-sm select-bordered"
                    value={settings.language}
                    onChange={(e) => handleChange(e.currentTarget.value)}
                >
                    <For each={availableLanguages}>
                        {(lang) => (
                            <option value={lang.code}>{lang.name}</option>
                        )}
                    </For>
                </select>
            }
        />
    );
}

export default LanguageSettings;

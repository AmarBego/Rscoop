import { For } from "solid-js";
import { Languages, ChevronDown } from "lucide-solid";
import settingsStore from "../../../stores/settings";
import { useI18n, availableLanguages } from "../../../i18n";
import Card from "../../common/Card";
import { Dropdown, DropdownItem } from "../../common/Dropdown";

function LanguageSettings() {
    const { settings, setLanguage } = settingsStore;
    const { t, setLanguage: setI18nLanguage } = useI18n();

    const handleChange = (lang: string) => {
        setLanguage(lang);
        setI18nLanguage(lang);
    };

    const currentLabel = () => availableLanguages.find(l => l.code === settings.language)?.name ?? settings.language;

    return (
        <Card
            title={t("settings.language.title")}
            icon={Languages}
            description={t("settings.language.description")}
            headerAction={
                <Dropdown
                    ariaLabel={t("settings.language.title")}
                    triggerClass="border border-base-content/20"
                    trigger={<><span>{currentLabel()}</span><ChevronDown class="w-4 h-4 opacity-60" aria-hidden="true" /></>}
                >
                    <For each={availableLanguages}>
                        {(lang) => (
                            <DropdownItem
                                active={settings.language === lang.code}
                                onClick={() => handleChange(lang.code)}
                            >
                                {lang.name}
                            </DropdownItem>
                        )}
                    </For>
                </Dropdown>
            }
        />
    );
}

export default LanguageSettings;

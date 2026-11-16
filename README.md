# Tessera Browser

Вертикальный браузер на Electron для Linux на телефоне (Tessera, Debian в PRoot/chroot, X11).

- профили (раздельные сессии), вкладки с миниатюрами
- юзерскрипты в формате Tampermonkey (GM_*), папка `~/.config/tessera-browser/userscripts`
- свой интерфейс: логотипы вместо текста, центральная кнопка-хаб с веером действий
- озвучка (espeak-ng): касание / долгое нажатие, как в модулях универсального приложения

## Установка и запуск

```bash
sudo apt install git nodejs npm espeak-ng
git clone https://github.com/vladyslavbokovnia/tessera-browser
cd tessera-browser
npm install
./run.sh
```

## Обновление

```bash
cd tessera-browser
./update.sh
```

`update.sh` делает `git pull`, закрывает старое окно (в браузере включён запрет второго экземпляра) и запускает заново.

## Переменные запуска

`TB_SCALE=2.5` масштаб интерфейса, `TB_NO_GPU=1`, `TB_MAXIMIZE=1`, `TB_FULLSCREEN=1`, `TB_FRAMELESS=1`, `TB_DATA=путь`.

## Жесты

Режим озвучки переключается кнопкой динамика: 0 выкл; 1 касание озвучивает, долгое нажатие действует; 2 действие + голос. Двойной тап по карточке вкладки закрывает её, долгое открывает действия.

## Ещё не сделано

Перетаскивание и скрытие пунктов меню и закладок, группы вкладок, синхронизация закладок через GitHub, обёртка VOT, всплывающие окна с opener, `@resource`, `GM_addValueChangeListener`, скрипты в iframe.

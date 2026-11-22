'use strict';
// Точка входа Tessera Browser: мобильный режим окна, затем обычный main.js.
// Без меню рабочего стола (Файл / Правка / Вид ...): всё управление через кнопку-хаб и панель вкладок.
// Окно по умолчанию развёрнуто; TB_WINDOWED=1 оставляет обычное окно, TB_FULLSCREEN=1 даёт полный экран.
const { Menu } = require('electron');

Menu.setApplicationMenu(null);
if (process.env.TB_WINDOWED !== '1' && !process.env.TB_MAXIMIZE && !process.env.TB_FULLSCREEN) {
  process.env.TB_MAXIMIZE = '1';
}
require('./main.js');

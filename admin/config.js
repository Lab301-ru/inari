/* Конфиг админки. Зашифрованный токен сюда вставляется один раз
   владельцем после запуска admin/encrypt-token.html.
   Файл публичный — в нём не должно быть PAT в открытом виде. */
window.ADMIN_CONFIG = {
  owner: 'Lab301-ru',
  repo: 'inari',
  branch: 'main',
  // Вставить сюда результат encrypt-token.html (base64-строка):
  encryptedToken: 'СЮДА_ВСТАВИТЬ_ЗАШИФРОВАННУЮ_СТРОКУ'
};

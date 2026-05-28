/* Конфиг админки. Зашифрованный токен сюда вставляется один раз
   владельцем после запуска admin/encrypt-token.html.
   Файл публичный — в нём не должно быть PAT в открытом виде. */
window.ADMIN_CONFIG = {
  owner: 'Lab301-ru',
  repo: 'inari',
  branch: 'main',
  // Вставить сюда результат encrypt-token.html (base64-строка):
  encryptedToken: 'eyJ2IjoxLCJzYWx0IjpbMTY2LDIxMiwxMTQsMjA4LDM0LDU1LDEzMSwzNywzLDM5LDY0LDIxMSwyMzIsOCwxNzYsMTYzXSwiaXYiOlsxMDAsNjUsMjUyLDEyMCwxMDUsMTkwLDE2NCwyMTMsMTM5LDIyNCwyNiw0MV0sImRhdGEiOls5MSwxNjgsNjQsMTc1LDE3MiwxNTMsMTgsNTEsMTQwLDY2LDE5LDE3MSwxMjQsMjMwLDI3LDE4OSwyNTUsMCwyMDIsODksMTQ0LDExMCwxNjgsNzMsMjAsMzgsMTY3LDIzNCw5NCw2NSwxMTAsMTQyLDM0LDE1OSw5MywxNzQsMTU1LDk1LDEzLDE1OSw5OSwxMzIsODEsMjIyLDE5NCwxNTEsMTA3LDE2MCwyNTUsMTA1LDUxLDI1MywxOTYsMTk2LDI1Miw2MF19'
};

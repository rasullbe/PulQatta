# Развертывание PulQatta

## Фронтенд (Netlify)
1. Код UI (`src/PulQatta.UI`) будет автоматически собираться и загружаться на Netlify благодаря GitHub Actions (`.github/workflows/deploy.yml`).
2. Необходимые секреты в GitHub: `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID`.

## Бэкенд (Render / Railway)
1. Создайте новый проект (Web Service) и привяжите ваш GitHub-репозиторий.
2. Сервисы Render и Railway автоматически найдут `Dockerfile` в корне проекта и соберут приложение.
3. Добавьте следующие переменные окружения (Environment Variables):
   - `BOT_TOKEN` — токен вашего Telegram-бота (от @BotFather).
   - `ConnectionStrings__Default` — строка подключения к вашей PostgreSQL базе данных.
   - `FRONTEND_ORIGIN` — ссылка на ваш Netlify-сайт (например, `https://pulqatta.netlify.app`), для настройки CORS.
   - `PORT` — платформа автоматически подставит свой порт, но можете указать вручную, если это требуется.

## Порядок запуска (Order of Steps)
1. Создать базу данных PostgreSQL на Render/Railway.
2. Получить строку подключения и вставить её в `ConnectionStrings__Default`.
3. Задеплоить Бэкенд.
4. Скопировать выданный URL бэкенда.
5. Открыть код фронтенда (`wwwroot/appsettings.json`) и вставить туда этот URL вместо `<YOUR_API_URL_HERE>`.
6. Закоммитить и отправить код фронтенда в GitHub. Action автоматически выложит его на Netlify.
7. Вставить URL от Netlify в настройки кнопки Mini App в `@BotFather`.

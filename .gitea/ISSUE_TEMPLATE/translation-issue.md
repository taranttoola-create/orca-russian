---
name: Проблема перевода
about: Неточный, непонятный или непереведённый текст в интерфейсе
title: 'Перевод: '
labels: перевод
body:
  - type: markdown
    attributes:
      value: |
        Спасибо за помощь в улучшении русской локализации Orca!
  - type: input
    id: where
    attributes:
      label: Где встретили строку
      description: Раздел интерфейса Orca (например, Настройки → Внешний вид)
    validations:
      required: true
  - type: textarea
    id: current
    attributes:
      label: Как выглядит сейчас
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: Как должно быть (ваш вариант)
    validations:
      required: false
  - type: input
    id: version
    attributes:
      label: Версия Orca
      description: Например, 1.4.192 (Settings → About)
    validations:
      required: true

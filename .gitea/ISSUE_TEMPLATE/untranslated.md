---
name: Непереведённая строка
about: Часть интерфейса осталась на английском
title: 'Untranslated: '
labels: непереведено
body:
  - type: markdown
    attributes:
      value: |
        Или прошлая версия словаря, или новая строка из свежего обновления Orca.
  - type: input
    id: where
    attributes:
      label: Где встретили (раздел интерфейса)
    validations:
      required: true
  - type: textarea
    id: text
    attributes:
      label: Английский текст
      description: Точная строка, как она выглядит в интерфейсе
    validations:
      required: true
  - type: input
    id: version
    attributes:
      label: Версия Orca
    validations:
      required: true

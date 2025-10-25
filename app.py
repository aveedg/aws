from backend import create_app
from flask import Flask
app = create_app()

@app.route("/")
def helloWorld():
  return "Hello, World!"

if __name__ == '__main__':
    app.run()
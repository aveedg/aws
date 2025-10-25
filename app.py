from backend import create_app
from flask import Flask, render_template
app = create_app()

@app.route("/")
def helloWorld():
  return "Hell bnhjjhhjhjo, World!"

if __name__ == '__main__':
    app.run()